"""Check real workspace scrolling with synthetic data; requires Playwright."""

import argparse
import json
import mimetypes
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import sync_playwright


WEBROOT = Path(__file__).resolve().parents[1] / "wwwroot"
CASES = [
    (1920, 1080, False),
    (1440, 900, False),
    (1366, 768, True),
    (1280, 550, True),  # Approximately the uploaded laptop screenshots at 150% scale.
    (800, 600, True),
    (768, 1024, True),
    (390, 844, True),
    (390, 667, True),
    (844, 390, True),
]
TABS = {"taskFlow": "taskFlowTable", "sessions": "sessionsTable"}


def fixture():
    events, items = [], []
    now = datetime.now(timezone.utc).replace(microsecond=0)
    title = ("A long task title that wraps across several lines: check laptop and phone "
             "layouts without squeezing the list into a tiny scrolling box")
    for i in range(300):
        at = (now - timedelta(hours=(99 - i // 3) * 2, minutes=(2 - i % 3) * 10)).isoformat()
        done = i % 2 == 0
        events.append(dict(id=i + 1, universalId=i + 1, eventType="Completed" if done else "Created",
                           eventAt=at, fromStatus="Open" if done else None, toStatus="Done" if done else "Open",
                           listId=1, displayId=str(i + 1), parentDisplayId=None, title=title, source="live"))
        items.append(dict(universalId=i + 1, listId=1, displayId=str(i + 1), parentDisplayId=None,
                          title=title, description="", status="Done" if done else "Open", createdAt=at,
                          updatedAt=at, completedAt=at if done else None, cancelledAt=None, reopenedAt=None))
    version = json.loads((WEBROOT / "version.json").read_text())["version"]
    snapshot = dict(version=version, lists=[dict(id=1, name="tech stuff", createdAt=events[0]["eventAt"])],
                    deletedLists=[], items=items, events=[], highestUniversalId=300, eventLogAvailable=True,
                    generatedAtUtc=now.isoformat(), databaseLastWriteUtc=now.isoformat())
    return snapshot, events


def serve_fixture(route, snapshot, events):
    url = urlsplit(route.request.url)
    if url.path == "/api/snapshot":
        route.fulfill(json=snapshot)
    elif url.path == "/api/events":
        after = int(parse_qs(url.query).get("afterId", ["0"])[0])
        route.fulfill(json=dict(resetRequired=False, lastEventId=300, cursor="fixture",
                                events=[event for event in events if event["id"] > after]))
    else:
        file = (WEBROOT / (url.path.lstrip("/") or "index.html")).resolve()
        if not file.is_relative_to(WEBROOT) or not file.is_file():
            route.fulfill(status=404, body="Not found")
            return
        route.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(str(file))[0]
                      or "application/octet-stream")


def open_tab(page, tab):
    page.locator(f'.tabs [data-tab="{tab}"]').click()
    page.wait_for_selector(f"#{TABS[tab]} tbody tr")
    page.locator("#workspace").evaluate("element => element.scrollTop = 0")


def check_layout(page, tab, flowing):
    metrics = page.evaluate("""tableId => {
        const workspace = document.querySelector('#workspace');
        const table = document.getElementById(tableId), wrap = table.parentElement;
        const footer = document.querySelector('.statusbar');
        return {
            workspaceScroll: workspace.scrollHeight - workspace.clientHeight,
            tableScroll: wrap.scrollHeight - wrap.clientHeight,
            tableHeight: wrap.clientHeight,
            bodyScroll: document.documentElement.scrollHeight - innerHeight,
            gap: workspace.getBoundingClientRect().bottom - wrap.getBoundingClientRect().bottom,
            footerBottom: footer.getBoundingClientRect().bottom,
            viewportHeight: innerHeight
        };
    }""", TABS[tab])
    assert metrics["bodyScroll"] <= 1, metrics
    assert metrics["footerBottom"] <= metrics["viewportHeight"] + 1, metrics
    if flowing:
        assert metrics["workspaceScroll"] > 300, metrics
        assert metrics["tableScroll"] <= 1, metrics
        assert metrics["tableHeight"] > 300, metrics
        # Scrolling the workspace must expose the list itself, rather than
        # stopping at a minimum-height inner box while controls occupy the page.
        top = page.evaluate("""tableId => {
            const workspace = document.querySelector('#workspace');
            const wrap = document.getElementById(tableId).parentElement;
            workspace.scrollTop += wrap.getBoundingClientRect().top - workspace.getBoundingClientRect().top;
            return wrap.getBoundingClientRect().top - workspace.getBoundingClientRect().top;
        }""", TABS[tab])
        assert abs(top) <= 1, top
    else:
        assert metrics["workspaceScroll"] <= 1, metrics
        assert metrics["tableScroll"] > 300, metrics
        assert metrics["tableHeight"] >= 300, metrics
        assert 0 <= metrics["gap"] <= (20 if tab == "sessions" else 10), metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", choices=["firefox", "chromium", "webkit"], default="firefox")
    args = parser.parse_args()
    snapshot, events = fixture()
    with sync_playwright() as playwright:
        browser = getattr(playwright, args.browser).launch(headless=True)
        try:
            context = browser.new_context(viewport=dict(width=1440, height=900), service_workers="block")
            context.route("http://stats.test/**", lambda route: serve_fixture(route, snapshot, events))
            page = context.new_page()
            page.set_default_timeout(10000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto("http://stats.test/")
            page.wait_for_function("state.snapshot !== null")
            for theme in ["light", "dark"]:
                page.evaluate("theme => window.TaskTheme.setPreference(theme)", theme)
                for width, height, flowing in CASES:
                    page.set_viewport_size(dict(width=width, height=height))
                    for tab in TABS:
                        open_tab(page, tab)
                        check_layout(page, tab, flowing)
                    print(f"{theme} {width}x{height}: both views passed", flush=True)
            assert not errors, errors
        finally:
            browser.close()


if __name__ == "__main__":
    main()

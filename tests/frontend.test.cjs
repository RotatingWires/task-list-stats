const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, event, item } = require('./frontend-fixture.cjs');

test('all creations count: the 100th undated event does not become the 100th dated event', () => {
  const f = fixture();
  f.snapshot({ events: Array.from({ length: 200 }, (_, i) => event(i + 1, { eventAt: i < 100 ? 'Unknown' : '2026-10-14' })) });
  f.run('renderMilestones()');
  const milestones = f.json('milestonePerListRecords(allRecordedEvents()).map(record => ({label:record.label,id:record.event.id,when:milestoneWhen(record.event)}))');
  assert.deepEqual(milestones, [{ label: 'A — 100th created', id: 100, when: 'Unknown date' }]);
  assert.match(f.get('#milestoneCards').textContent, /Recorded events in scope200/);
  assert.match(f.get('#milestonesTimeline').textContent, /Unknown date/);
});

test('milestone attribution follows event recording order even for backdated imports', () => {
  const f = fixture();
  f.snapshot({ events: [event(1), event(2, { eventAt: '2010-01-01' })] });
  assert.equal(f.run("milestoneEventRecords(allRecordedEvents(), 'Created')[0].event.id"), 1);
  assert.equal(f.run("milestoneYearRecords(allRecordedEvents()).find(r=>r.label==='2010 — First created').event.id"), 2);
});

for (const type of ['Created', 'Completed', 'Cancelled', 'Reopened', 'Deleted']) {
  test(type + ' milestones retain undated events', () => {
    const f = fixture();
    f.snapshot({ events: Array.from({ length: 100 }, (_, i) => event(i + 1, { eventType: type, eventAt: 'Unknown' })) });
    assert.equal(f.run('milestoneEventRecords(allRecordedEvents(), ' + JSON.stringify(type) + ').at(-1).event.id'), 100);
    assert.deepEqual(f.json('milestoneYearRecords(allRecordedEvents())'), []);
    f.run('renderMilestones()');
    assert.match(f.get('#milestonesTimeline').textContent, /Unknown date/);
  });
}

test('undated Universal IDs and duplicate creation records use the original UID event', () => {
  const f = fixture();
  f.snapshot({ events: [event(2, { universalId: 1, eventAt: 'Unknown' }), event(3, { universalId: 100, eventAt: 'Unknown' }),
    event(4, { universalId: 100 })] });
  assert.deepEqual(f.json('milestoneUniversalIdRecords(allRecordedEvents()).map(r=>r.event.id)'), [2, 3]);
});

test('large UID histories do not exceed the JavaScript argument limit', () => {
  const f = fixture();
  f.snapshot({ events: Array.from({ length: 160000 }, (_, i) => event(i + 1)) });
  assert.equal(f.run('milestoneUniversalIdRecords(allRecordedEvents()).at(-1).event.universalId'), 160000);
});

for (const mode of ['chronological', 'year', 'type', 'list']) {
  test('milestone ' + mode + ' grouping accepts unknown dates', () => {
    const f = fixture();
    f.snapshot({ events: [event(1, { eventAt: 'Unknown' }), event(2, { eventAt: 'invalid' })] });
    f.get('#milestoneSort').value = mode;
    f.run('renderMilestones()');
    assert.ok(f.get('#milestonesTimeline').children.length > 0);
    assert.match(f.get('#milestonesTimeline').textContent, /Unknown date/);
  });
}

test('Type separates overall, yearly, and list milestones with numeric progression', () => {
  const f = fixture();
  f.snapshot({ lists: [{ id: 1, name: 'Zulu' }, { id: 2, name: 'Alpha' }],
    deletedLists: [{ id: 3, name: 'Archived list' }],
    events: Array.from({ length: 500 }, (_, i) => event(i + 1, {
      listId: i < 100 || i >= 400 ? 1 : i < 200 ? 2 : i < 300 ? 1 : 3,
      eventAt: i < 100 ? 'Unknown' : i < 200 || i >= 300 ? '2026-10-14' : '2025-01-01',
    })) });
  const records = ' [...milestoneEventRecords(allRecordedEvents(),"Created"), ...milestoneYearRecords(allRecordedEvents()), ...milestonePerListRecords(allRecordedEvents())]';
  f.run('const typeRecords = ' + records + '; typeRecords.reverse();');
  const before = f.json('typeRecords.map(r=>r.label)');
  assert.deepEqual(f.json('milestoneTypeGroups(typeRecords).map(g=>({label:g.label,thresholds:g.records.map(r=>r.threshold)}))'), [
    { label: 'Overall', thresholds: [1, 100, 500] },
    { label: 'Year — 2026', thresholds: [1, 100] },
    { label: 'Year — 2025', thresholds: [1, 100] },
    { label: 'List — Alpha', thresholds: [100] },
    { label: 'List — Archived list (deleted)', thresholds: [100] },
    { label: 'List — Zulu', thresholds: [100] },
  ]);
  assert.deepEqual(f.json('typeRecords.map(r=>r.label)'), before);
  assert.equal(f.run('milestoneTypeGroups(typeRecords)[0].records[1].event.eventDate'), null);
  f.get('#milestoneSort').value = 'type';
  f.run('renderMilestones()');
  const created = f.get('#milestonesTimeline').children[0];
  assert.equal(created.children[0].textContent, 'Created');
  assert.deepEqual(created.children.slice(1).map(section => section.children[0].textContent),
    ['Overall', 'Year — 2026', 'Year — 2025', 'List — Alpha', 'List — Archived list (deleted)', 'List — Zulu']);
  const yearTiles = created.children[2].querySelectorAll('.milestone-row');
  assert.deepEqual(yearTiles.map(tile=>tile.querySelector('strong').textContent), ['First created', '100th created']);
  assert.match(created.children[1].textContent, /Unknown date/);
});

test('Type respects list scope and does not combine identically named lists', () => {
  const f = fixture();
  f.snapshot({ lists: [{id:2,name:'same'}], deletedLists: [{id:1,name:'same'}],
    events: Array.from({length:200}, (_,i)=>event(i+1,{listId:i<100?1:2,eventAt:'Unknown'})) });
  assert.deepEqual(f.json('milestoneTypeGroups(milestonePerListRecords(allRecordedEvents())).map(g=>g.scopeValue)'), [2, 1]);
  f.run('state.selectedListIds.add(2)');
  f.get('#milestoneSort').value = 'type';
  f.run('renderMilestones()');
  const text = f.get('#milestonesTimeline').textContent;
  assert.match(text, /Overall/);
  assert.match(text, /List — same/);
  assert.doesNotMatch(text, /\(deleted\)|Year —/);
  assert.equal(f.get('#milestonesTimeline').children[0].querySelectorAll('.milestone-subgroup').length, 2);
});

test('other milestone sorts keep full tile labels and do not add Type subsections', () => {
  const f = fixture();
  f.snapshot({events:Array.from({length:100},(_,i)=>event(i+1))});
  for (const mode of ['chronological', 'year', 'list']) {
    f.get('#milestoneSort').value = mode;
    f.run('renderMilestones()');
    const timeline = f.get('#milestonesTimeline');
    assert.equal(timeline.querySelectorAll('.milestone-subgroup').length, 0);
    assert.match(timeline.textContent, /A — 100th created/);
    assert.match(timeline.textContent, /2026 — 100th created/);
  }
});

test('all-time Task Flow includes unknown dates; explicit date ranges exclude them', () => {
  const f = fixture();
  f.snapshot({ events: [event(1, { eventAt: 'Unknown' }), event(2)] });
  f.run('renderTaskFlow()');
  assert.equal(f.rows('#taskFlowTable').length, 2);
  assert.equal(f.rows('#taskFlowTable').at(-1)[0], 'Unknown');
  f.get('#taskFlowDateRange').value = '10/1/26 - 10/31/26';
  f.run('renderTaskFlow()');
  assert.equal(f.rows('#taskFlowTable').length, 1);
});

test('unknown dates stay after known dates in both Task Flow sort directions', () => {
  const f = fixture();
  f.snapshot({ events: [event(1), event(2, { eventAt: 'Unknown' }), event(3, { eventAt: '2020-01-01' })] });
  for (const order of ['oldest', 'latest']) {
    f.get('#taskFlowOrder').value = order;
    f.run('renderTaskFlow()');
    assert.equal(f.rows('#taskFlowTable').at(-1)[0], 'Unknown');
  }
});

test('rename preserves list selection, current counts, and historical attribution', () => {
  const f = fixture();
  f.snapshot({ items: [item(1)], events: [event(1)] });
  f.run("state.selectedListIds.add(1); state.snapshot.lists[0].name='homework year 2'; populateListFilter();");
  assert.deepEqual(f.json('Array.from(state.selectedListIds)'), [1]);
  assert.equal(f.run('scopedItems().length'), 1);
  assert.equal(f.run('scopedRecordedEvents().length'), 1);
  assert.match(f.get('#listFilterMenu').textContent, /homework year 2/);
  f.get('#taskFlowQuery').value = 'homework year 2';
  f.run('renderTaskFlow()');
  assert.equal(f.rows('#taskFlowTable')[0][2], 'homework year 2');
});

test('deleted list names and reusing the name cannot cross list identities', () => {
  const f = fixture();
  f.snapshot({ lists: [{ id: 2, name: 'homework' }], deletedLists: [{ id: 1, name: 'homework' }],
    items: [item(7, { listId: 2 })], events: [event(7)] });
  assert.equal(f.run('listName(1)'), 'homework (deleted)');
  assert.equal(f.run('listName(2)'), 'homework');
  f.run('state.selectedListIds.add(2)');
  assert.equal(f.run('scopedItems().length'), 1);
  assert.equal(f.run('scopedRecordedEvents().length'), 0);
});

test('moved task history links follow Universal ID rather than reused visible IDs', () => {
  const f = fixture();
  f.snapshot({ items: [item(7, { listId: 2, displayId: '2' }), item(8, { listId: 1, displayId: '1' })],
    events: [event(1, { universalId: 7, displayId: '1' })] });
  f.run('renderTaskFlow()');
  const link = f.get('#taskFlowTable').querySelectorAll('a')[0];
  assert.match(link.href, /\/task\/7$/);
  assert.equal(link.textContent, '#1');
  assert.match(link.title, /B task #2/);
  f.run('state.selectedListIds.add(2)');
  assert.equal(f.run('scopedItems().length'), 1);
  assert.equal(f.run('scopedRecordedEvents().length'), 0);
});

test('deleted tasks retain unlinked Task Flow history', () => {
  const f = fixture();
  f.snapshot({ events: [event(1)] });
  f.run('renderTaskFlow()');
  assert.equal(f.rows('#taskFlowTable').length, 1);
  assert.equal(f.get('#taskFlowTable').querySelectorAll('a').length, 0);
});

test('all-time Compare includes undated records while calendar statistics need dates', () => {
  const f = fixture();
  f.snapshot({ items: [item(1, { createdAt: 'Unknown' }), item(2)], events: [event(1, { eventAt: 'Unknown' }), event(2)] });
  assert.equal(f.run('compareEventCounts(scopedRecordedEvents()).Created'), 2);
  assert.equal(f.run("dailyMap(scopedItems(), 'created').size"), 1);
  assert.equal(f.run('inDateRange(null, {from:null,to:null})'), true);
  assert.equal(f.run('inDateRange(null, {from:new Date(),to:null})'), false);
});

test('all status-pair and deletion combinations produce correct net open flow', () => {
  const f = fixture();
  for (const first of ['Open', 'Done', 'Cancelled']) {
    for (const final of ['Open', 'Done', 'Cancelled']) {
      for (const deleted of [false, true]) {
        let id = 1;
        const events = [event(id++)];
        if (first !== 'Open') events.push(event(id++, { eventType: first === 'Done' ? 'Completed' : 'Cancelled', fromStatus: 'Open', toStatus: first }));
        if (final !== first) events.push(event(id++, { eventType: final === 'Open' ? 'Reopened' : final === 'Done' ? 'Completed' : 'Cancelled', fromStatus: first, toStatus: final }));
        if (deleted) events.push(event(id++, { eventType: 'Deleted', fromStatus: final, toStatus: 'Deleted' }));
        f.snapshot({ events });
        assert.equal(f.run('compareEventCounts(allRecordedEvents()).net'), !deleted && final === 'Open' ? 1 : 0,
          JSON.stringify({ first, final, deleted }));
      }
    }
  }
});

test('reconstructed legacy closed transitions still contribute to net flow', () => {
  const f = fixture();
  f.snapshot({ events: [event(1, { eventAt: 'Unknown', source: 'legacy' }),
    event(2, { eventType: 'Completed', eventAt: 'Unknown', source: 'legacy', fromStatus: null, toStatus: 'Done' })] });
  assert.equal(f.run('compareEventCounts(allRecordedEvents()).net'), 0);
});

test('year milestones are consistent across time zones and offset year boundaries', () => {
  const saved = process.env.TZ;
  try {
    for (const zone of ['America/New_York', 'UTC', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      const f = fixture();
      f.snapshot({ events: [event(1, { eventAt: '2026-01-01T00:30:00+02:00' }),
        event(2, { eventAt: '2025-12-31T23:30:00-02:00' }), event(3, { eventAt: '2026-01-01' }),
        event(4, { eventAt: 'Unknown' })] });
      assert.deepEqual(f.json('allRecordedEvents().map(milestoneEventYear)'), [2025, 2026, 2026, null]);
    }
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

test('invalid date-only imports are unknown instead of rolling into another month', () => {
  const f = fixture();
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-01-00', '2025-02-29', '2026-02-30T12:00:00Z'])
    assert.equal(f.run('parseDate(' + JSON.stringify(date) + ')'), null, date);
  for (const date of ['2024-02-29', '2026-01-01', '0000-02-29'])
    assert.notEqual(f.run('parseDate(' + JSON.stringify(date) + ')'), null, date);
});

test('task tree statistics separate duplicate display IDs in different lists', () => {
  const f = fixture();
  f.snapshot({ items: [item(1, { displayId: '1' }), item(2, { displayId: '1.1', parentDisplayId: '1' }),
    item(3, { listId: 2, displayId: '1' }), item(4, { listId: 2, displayId: '1.1', parentDisplayId: '1' }),
    item(5, { listId: 2, displayId: '1.2', parentDisplayId: '1' })] });
  f.run('renderTrees()');
  assert.deepEqual(f.rows('#largestTreesTable').map(row => row.slice(0, 4)), [['B', '#1', 'task', '3'], ['A', '#1', 'task', '2']]);
});

test('unknown completion dates count as Done without inventing durations', () => {
  const f = fixture();
  f.snapshot({ items: [item(1, { status: 'Done', createdAt: 'Unknown', completedAt: 'Unknown' }),
    item(2, { status: 'Done', createdAt: '2026-10-13', completedAt: '2026-10-14' })] });
  f.run('renderOverview()');
  assert.match(f.get('#activityCards').textContent, /Done2/);
  assert.deepEqual(f.json('scopedItems().map(durationMs)'), [null, null]);
});

test('snapshot refresh is coalesced and keeps non-history tabs lazy', async () => {
  const f = fixture();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const requests = [];
  f.context.fetch = async url => {
    requests.push(url);
    if (url === '/api/snapshot') { await pending; return { ok: true, json: async () => ({ lists: [{id:1,name:'A'}], items: [], eventLogAvailable: true }) }; }
    return { ok: true, json: async () => ({ version: 'test' }) };
  };
  const a = f.run('loadSnapshot()');
  const b = f.run('loadSnapshot()');
  release();
  await Promise.all([a, b]);
  assert.equal(requests.filter(url => url === '/api/snapshot').length, 1);
  assert.equal(requests.some(url => url.startsWith('/api/events')), false);
  assert.equal(f.run('state.snapshotLoading'), null);
});

test('incremental refresh resets cached events after restore and coalesces requests', async () => {
  const f = fixture();
  f.snapshot({ events: [event(1, { title: 'old dataset' })] });
  f.run("state.lastEventId=1; state.eventCursor='old'; state.eventsNeedRefresh=true");
  let calls = 0;
  f.context.fetch = async () => { calls++; return { ok: true, json: async () => ({
    resetRequired: true, events: [event(1, { title: 'restored dataset' })], lastEventId: 1, cursor: 'new',
  }) }; };
  await Promise.all([f.run('ensureEventsLoaded()'), f.run('ensureEventsLoaded()')]);
  assert.equal(calls, 1);
  assert.deepEqual(f.json('state.snapshot.events.map(event=>event.title)'), ['restored dataset']);
});

test('a late history response cannot overwrite a replacement snapshot or clear its new request', async () => {
  const f = fixture();
  f.snapshot({ events: [event(1)] });
  f.run('state.eventsNeedRefresh=true');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  f.context.fetch = async () => { await pending; return { ok: true, json: async () => ({ events: [event(2)], lastEventId: 2 }) }; };
  const old = f.run('ensureEventsLoaded()');
  f.snapshot({ events: [event(9, { title: 'new snapshot' })] });
  f.context.sentinel = Promise.resolve();
  f.run('state.eventsLoading=sentinel');
  release();
  await old;
  assert.deepEqual(f.json('state.snapshot.events.map(event=>event.id)'), [9]);
  assert.equal(f.run('state.eventsLoading'), f.context.sentinel);
});

test('every Stats workspace renders mixed moved, undated, date-only, closed, and deleted data', () => {
  const f = fixture();
  f.snapshot({ highestUniversalId: 100,
    lists: [{id:1,name:'homework renamed'}, {id:2,name:'archived list'}],
    deletedLists: [{id:3,name:'deleted list'}],
    items: [item(1, {createdAt:'Unknown'}), item(2, {listId:2,displayId:'1',status:'Done',completedAt:'Unknown'}),
      item(3, {displayId:'1.1',parentDisplayId:'1',createdAt:'2026-10-13'}),
      item(4, {status:'Cancelled',cancelledAt:'2026-10-14T13:00:00Z'})],
    events: [event(1, {eventAt:'Unknown'}), event(2), event(3, {eventType:'Completed',toStatus:'Done',fromStatus:'Open'}),
      event(4, {listId:3,eventType:'Deleted',fromStatus:'Open',toStatus:'Deleted'})],
  });
  f.get('#trendGroup').value = 'month';
  f.get('#compareMode').value = 'lists';
  f.get('#sessionGap').value = '30';
  for (const id of ['heatmapMode', 'calendarMode', 'monthYearHeatmapMode', 'hourHeatmapMode'])
    f.get('#' + id).value = 'created';
  f.run("Fun.initialize(); milestonesView={renderMilestones};");
  for (const tab of ['overview','trends','calendar','lists','patterns','trees','taskFlow','compare','sessions','milestones','fun']) {
    for (const scope of [[], [1], [2]]) {
      f.context.auditTab = tab;
      f.context.auditScope = scope;
      assert.doesNotThrow(() => f.run('state.activeTab=auditTab; state.selectedListIds=new Set(auditScope); renderAll()'),
        tab + ' ' + JSON.stringify(scope));
    }
  }
});

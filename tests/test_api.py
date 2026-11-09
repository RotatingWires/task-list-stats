"""API tests against the real TaskList Stats server on a throwaway data folder, like TaskList's and SpendTracker's.
Run: python3 -m unittest discover -s tests"""

import unittest

from server import ApiError, Server, build


def setUpModule():
    build()


class StatsApiTests(unittest.TestCase):
    def setUp(self):
        self.server = Server(args=("--TaskListStats:DatabasePath=does-not-exist/tasklist.db",))
        self.addCleanup(self.server.stop)
        self.api = self.server.logged_in_client()

    def test_missing_tasklist_database_is_explained(self):
        with self.assertRaises(ApiError) as context:
            self.api.get("/api/snapshot")
        self.assertEqual(context.exception.status, 503)
        self.assertIn("TaskListStats:DatabasePath", context.exception.body["error"])

    def test_unknown_addresses_answer_404(self):
        with self.assertRaises(ApiError) as context:
            self.api.get("/api/no-such-thing")
        self.assertEqual(context.exception.status, 404)
        self.assertEqual(context.exception.body, {"error": "Not found"})


if __name__ == "__main__":
    unittest.main()

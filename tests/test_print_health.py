"""Offline production health contract and report/exit behavior."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ops"))
import print_health as p
from health import Resp

READY = {"ok": True, "environment": "production", "etsy_mode": "live", "etsy": "ok"}


def response(body=READY, status=200):
    return Resp(status, {"content-type": "application/json"}, json.dumps(body).encode())


class PrintHealth(unittest.TestCase):
    def test_fetches_only_the_public_health_endpoint(self):
        calls = []
        def http(url):
            calls.append(url)
            return response()
        self.assertTrue(p.check("https://print.example.test/", http)[0])
        self.assertEqual(calls, ["https://print.example.test/api/health"])

    def test_requires_ready_live_production(self):
        for changed in ({"environment": "staging"}, {"etsy_mode": "seeded"},
                        {"etsy": "missing"}, {"etsy": "stale"}, {"ok": False}, {"ok": 1}):
            with self.subTest(changed=changed):
                self.assertFalse(p.check("https://print.example.test", lambda u: response(READY | changed))[0])
        for key in READY:
            self.assertFalse(p.check("https://print.example.test", lambda u: response({k: v for k, v in READY.items() if k != key}))[0])

    def test_non_200_including_redirect_never_passes(self):
        for status in (301, 404, 429, 500, 503):
            with self.subTest(status=status):
                ok, detail = p.check("https://print.example.test", lambda u: response(status=status))
                self.assertFalse(ok)
                self.assertIn(str(status), detail)

    def test_unavailable_and_malformed_reports_fail(self):
        for error in (URLError("offline"), TimeoutError(), OSError()):
            def http(url):
                raise error
            self.assertFalse(p.check("https://print.example.test", http)[0])
        for raw in (b"<html>unavailable</html>", b"null", b"[]", b"true", b"\xff"):
            self.assertFalse(p.check("https://print.example.test", lambda u: Resp(200, {}, raw))[0])

    def test_cli_writes_matching_report_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            report = Path(d) / "health.md"
            for status, expected in ((200, 0), (503, 1)):
                result = p.main(["https://print.example.test", "--markdown", str(report)],
                                http=lambda u: response(status=status))
                self.assertEqual(result, expected)
                self.assertIn("PASS:" if expected == 0 else "FAIL:", report.read_text())


if __name__ == "__main__":
    unittest.main()

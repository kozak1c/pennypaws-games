"""The watchdog's one alert issue: when it opens, comments, closes or stays quiet."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ops"))
import watchdog_issue as w  # noqa: E402

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


def issue(number=7, title=w.TITLE, login="app/github-actions", hours_ago=1.0):
    updated = (NOW - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"number": number, "title": title, "updatedAt": updated, "author": {"login": login}}


class Decide(unittest.TestCase):
    def test_a_failure_with_no_alert_opens_one(self):
        self.assertEqual(w.decide(False, None, NOW), "create")

    def test_a_failure_with_a_fresh_alert_stays_quiet(self):
        self.assertEqual(w.decide(False, issue(hours_ago=5.9), NOW), "none")

    def test_a_failure_with_an_old_alert_comments(self):
        self.assertEqual(w.decide(False, issue(hours_ago=6), NOW), "comment")

    def test_a_pass_closes_the_alert_and_is_silent_without_one(self):
        self.assertEqual(w.decide(True, issue(), NOW), "close")
        self.assertEqual(w.decide(True, None, NOW), "none")


class OwnAlertOnly(unittest.TestCase):
    def test_someone_elses_issue_with_the_same_title_is_not_the_alert(self):
        self.assertIsNone(w.open_alert([issue(login="a-stranger")]))

    def test_another_title_is_not_the_alert(self):
        self.assertIsNone(w.open_alert([issue(title="[watchdog] something else")]))

    def test_the_oldest_own_alert_is_used(self):
        self.assertEqual(w.open_alert([issue(9), issue(4), issue(5, login="a-stranger")])["number"], 4)


class Main(unittest.TestCase):
    def run_main(self, ok, listed, owner="the-owner"):
        calls = []

        def fake(args):
            calls.append(args)
            return json.dumps(listed) if args[:2] == ["issue", "list"] else ""

        with tempfile.TemporaryDirectory() as d:
            report = Path(d) / "health.md"
            report.write_text("FAIL exact /app-ads.txt: HTTP 404\n", encoding="utf-8")
            code = w.main(["true" if ok else "false", str(report), "https://example.test/run/1"], run=fake, now=NOW, owner=owner)
        return code, calls

    def test_a_failure_opens_the_issue_with_the_report_and_the_run(self):
        code, calls = self.run_main(False, [])
        self.assertEqual(code, 0)
        create = calls[-1]
        self.assertEqual(create[:4], ["issue", "create", "--title", w.TITLE])
        text = create[create.index("--body") + 1]
        self.assertIn("FAIL exact /app-ads.txt: HTTP 404", text)
        self.assertIn("https://example.test/run/1", text)

    def test_the_new_issue_is_assigned_to_the_owner_so_github_emails_it(self):
        _, calls = self.run_main(False, [])
        self.assertEqual(calls[-1][-2:], ["--assignee", "the-owner"])
        _, calls = self.run_main(False, [], owner="")
        self.assertNotIn("--assignee", calls[-1])

    def test_a_stranger_cannot_silence_the_alert(self):
        _, calls = self.run_main(False, [issue(login="a-stranger", hours_ago=0.1)])
        self.assertEqual(calls[-1][:2], ["issue", "create"])

    def test_recovery_closes_only_the_workflows_own_issue(self):
        _, calls = self.run_main(True, [issue(3, login="a-stranger"), issue(8)])
        self.assertEqual(calls[-1][:3], ["issue", "close", "8"])

    def test_a_pass_with_nothing_open_only_lists(self):
        _, calls = self.run_main(True, [])
        self.assertEqual(len(calls), 1)

    def test_bad_arguments_are_refused(self):
        self.assertEqual(w.main(["maybe", "x", "y"], run=lambda a: "[]"), 2)


if __name__ == "__main__":
    unittest.main()

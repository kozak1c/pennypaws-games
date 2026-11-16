"""Tests for ops/feed_only.py: which changes may go live without the owner's merge."""

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ops"))
import feed_only  # noqa: E402

FEED = feed_only.FEED
BASE = {
    "schema_version": 2,
    "games": [{"id": "squishy-bop", "status": "out", "page": "/squishy-bop/", "price": "Free", "rating": 4.5}],
    "printables": [{"id": "p1", "price_usd": 4.99, "page": "/printables/p1/"}],
    "books": [{"id": "b1", "price_usd": 7.99}],
}


def text(feed: dict) -> str:
    return json.dumps(feed, indent=2) + "\n"


def changed(**edits) -> dict:
    feed = copy.deepcopy(BASE)
    for path, value in edits.items():
        collection, index, field = path.split("__")
        feed[collection][int(index)][field] = value
    return feed


class Decide(unittest.TestCase):
    def test_a_price_change_is_feed_only(self):
        ok, reasons = feed_only.decide([FEED], text(BASE), text(changed(printables__0__price_usd=5.99)))
        self.assertTrue(ok, reasons)
        self.assertEqual(reasons, [])

    def test_a_rating_and_a_tagline_are_feed_only(self):
        new = changed(games__0__rating=4.7, books__0__tagline="New words")
        self.assertTrue(feed_only.decide([FEED], text(BASE), text(new))[0])

    def test_a_new_product_waits(self):
        new = copy.deepcopy(BASE)
        new["books"].append({"id": "b2"})
        ok, reasons = feed_only.decide([FEED], text(BASE), text(new))
        self.assertFalse(ok)
        self.assertIn("books/b2 appears for the first time", reasons)

    def test_a_removed_product_waits(self):
        new = copy.deepcopy(BASE)
        new["books"] = []
        self.assertIn("books/b1 leaves the site", feed_only.decide([FEED], text(BASE), text(new))[1])

    def test_a_status_change_waits(self):
        ok, reasons = feed_only.decide([FEED], text(BASE), text(changed(games__0__status="coming-soon")))
        self.assertFalse(ok)
        self.assertEqual(reasons, ["games/squishy-bop changes its status"])

    def test_a_page_change_waits(self):
        reasons = feed_only.decide([FEED], text(BASE), text(changed(printables__0__page="/elsewhere/")))[1]
        self.assertEqual(reasons, ["printables/p1 changes its page"])

    def test_a_schema_change_waits(self):
        new = copy.deepcopy(BASE)
        new["schema_version"] = 3
        self.assertIn("the feed's schema version changes", feed_only.decide([FEED], text(BASE), text(new))[1])

    def test_a_new_top_level_key_waits(self):
        new = copy.deepcopy(BASE)
        new["toys"] = []
        self.assertIn("the feed's top-level keys change", feed_only.decide([FEED], text(BASE), text(new))[1])

    def test_any_other_file_waits(self):
        ok, reasons = feed_only.decide([FEED, "ops/feed_only.py"], text(BASE), text(changed(books__0__price_usd=1)))
        self.assertFalse(ok)
        self.assertIn("ops/feed_only.py", reasons[0])

    def test_nothing_changed_is_not_a_release(self):
        self.assertFalse(feed_only.decide([], text(BASE), text(BASE))[0])

    def test_a_broken_feed_waits(self):
        self.assertFalse(feed_only.decide([FEED], text(BASE), "{not json")[0])
        self.assertFalse(feed_only.decide([FEED], None, text(BASE))[0])
        self.assertFalse(feed_only.decide([FEED], text(BASE), "[]")[0])

    def test_a_rewrite_with_no_fact_changes_is_feed_only(self):
        self.assertTrue(feed_only.decide([FEED], text(BASE), json.dumps(BASE))[0])


class FromGit(unittest.TestCase):
    """The whole command on a real repository: merge base for staging, tree to tree for main."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        self.cwd = os.getcwd()
        os.chdir(self.repo)
        for args in (["init", "-q", "-b", "main"], ["config", "user.name", "t"], ["config", "user.email", "t@t"],
                     ["config", "commit.gpgsign", "false"]):
            subprocess.run(["git", *args], check=True)
        self.commit({FEED: text(BASE), "README.md": "site\n"}, "base")

    def tearDown(self):
        os.chdir(self.cwd)
        self.tmp.cleanup()

    def commit(self, files: dict, message: str) -> str:
        for name, body in files.items():
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8", newline="\n")
            subprocess.run(["git", "add", name], check=True)
        subprocess.run(["git", "commit", "-q", "-m", message], check=True)
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()

    def run_main(self, base, head, into):
        out = self.repo / "out.txt"
        out.unlink(missing_ok=True)
        os.environ["GITHUB_OUTPUT"] = str(out)
        try:
            code = feed_only.main(["--base", base, "--head", head, "--into", into])
        finally:
            del os.environ["GITHUB_OUTPUT"]
        return code, out.read_text(encoding="utf-8").strip()

    def test_feed_pull_request_into_staging(self):
        base = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        head = self.commit({FEED: text(changed(books__0__price_usd=8.99))}, "feed")
        self.assertEqual(self.run_main(base, head, "staging"), (0, "feed_only=true"))

    def test_staging_moved_on_since_the_feed_branch(self):
        """Into staging judges what the pull request adds, not what staging gained since."""
        root = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        head = self.commit({FEED: text(changed(books__0__price_usd=8.99))}, "feed")
        subprocess.run(["git", "checkout", "-q", "-b", "staging", root], check=True)
        base = self.commit({"README.md": "site, changed\n"}, "other work")
        self.assertEqual(self.run_main(base, head, "staging"), (0, "feed_only=true"))
        # Into main the same pair is the whole tree, which includes the other work.
        self.assertEqual(self.run_main(base, head, "main"), (0, "feed_only=false"))

    def test_release_with_other_work_waits(self):
        main = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        self.commit({"README.md": "new words\n"}, "other work")
        head = self.commit({FEED: text(changed(books__0__price_usd=8.99))}, "feed")
        self.assertEqual(self.run_main(main, head, "main"), (0, "feed_only=false"))


if __name__ == "__main__":
    unittest.main()

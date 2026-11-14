"""ops/site_url.py: the address to health-check, read from wrangler's output file."""

from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ops"))

import site_url  # noqa: E402

SESSION = {"type": "wrangler-session", "version": 1, "wrangler_version": "4.162.0"}


def output(*targets: str, version_id: str = "11111111-2222-3333-4444-555555555555") -> str:
    deploy = {"type": "deploy", "version": 1, "worker_name": "pennypaws-site", "version_id": version_id,
              "targets": list(targets)}
    return json.dumps(SESSION) + "\n" + json.dumps(deploy) + "\n"


class SiteUrlTest(unittest.TestCase):
    def test_custom_domain(self):
        text = output("staging.pennypawsgames.com (custom domain)")
        self.assertEqual(site_url.site_url(site_url.deploy_entry(text)), "https://staging.pennypawsgames.com")

    def test_workers_dev_before_the_domain_moves(self):
        text = output("https://pennypaws-site.example.workers.dev")
        self.assertEqual(site_url.site_url(site_url.deploy_entry(text)), "https://pennypaws-site.example.workers.dev")

    def test_custom_domain_wins_over_workers_dev(self):
        text = output("https://pennypaws-site.example.workers.dev", "pennypawsgames.com (custom domain)")
        self.assertEqual(site_url.site_url(site_url.deploy_entry(text)), "https://pennypawsgames.com")

    def test_custom_domain_with_a_zone_note(self):
        text = output("pennypawsgames.com (custom domain - zone name: pennypawsgames.com)")
        self.assertEqual(site_url.site_url(site_url.deploy_entry(text)), "https://pennypawsgames.com")

    def test_a_route_pattern_is_not_an_address(self):
        with self.assertRaises(ValueError):
            site_url.site_url(site_url.deploy_entry(output("pennypawsgames.com/* (zone name: pennypawsgames.com)")))

    def test_no_targets(self):
        with self.assertRaises(ValueError):
            site_url.site_url(site_url.deploy_entry(output()))

    def test_no_deploy_entry(self):
        with self.assertRaises(ValueError):
            site_url.deploy_entry(json.dumps(SESSION) + "\nnot json\n")

    def test_command_line(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "deploy.ndjson"
            f.write_text(output("staging.pennypawsgames.com (custom domain)"), encoding="utf-8")
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(site_url.main([str(f)]), 0)
            self.assertEqual(out.getvalue().strip(), "https://staging.pennypawsgames.com")
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(site_url.main([str(f), "--field", "version_id"]), 0)
            self.assertEqual(out.getvalue().strip(), "11111111-2222-3333-4444-555555555555")
            with redirect_stderr(io.StringIO()):
                self.assertEqual(site_url.main([str(Path(d) / "missing")]), 1)
                self.assertEqual(site_url.main([str(f), "--field", "nope"]), 1)


if __name__ == "__main__":
    unittest.main()

"""ops/health.py against a fake site: a healthy one passes, and each broken thing fails its check."""

from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ops"))

import health  # noqa: E402

SPEC = health.load_spec()
APP_ADS = b"google.com, pub-5568542430803397, DIRECT, f08c47fec0942fa0\n"
HEADERS = {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": "default-src 'none'; script-src 'self'",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "cache-control": "public, max-age=0, must-revalidate, no-transform",
    "x-robots-tag": "noindex",
}


def page(title: str, body: str = "") -> bytes:
    return f"<!doctype html><html lang=en><head><title>{title}</title></head><body>{body}</body></html>".encode()


class Site:
    """A fake site: path -> (status, headers, body). Unknown paths answer 404."""

    def __init__(self, base: str = "https://staging.pennypawsgames.com", indexable: bool = False):
        self.base = base
        self.headers = dict(HEADERS)
        if indexable:
            del self.headers["x-robots-tag"]
        self.routes: dict[str, tuple[int, dict[str, str], bytes]] = {
            "/": (200, {}, page("Penny Paws Games", '<a href="squishy-bop/privacy/">Privacy</a>')),
            "/squishy-bop/privacy/": (200, {}, page("Squishy Bop! Privacy Policy",
                                                    '<a href="https://policies.google.com/privacy">Google</a>')),
            "/squishy-bop/privacy": (307, {"location": "/squishy-bop/privacy/"}, b""),
            "/app-ads.txt": (200, {"content-type": "text/plain; charset=utf-8"}, APP_ADS),
        }
        self.http_redirect = True
        self.requests: list[str] = []
        # Addresses outside the site that the never-break list expects to redirect here.
        self.elsewhere: dict[str, health.Resp] = {
            e["from"]: health.Resp(301, {"location": e["to"]}, b"") for e in SPEC.get("redirect", [])
        }

    def __call__(self, url: str) -> health.Resp:
        self.requests.append(url)
        if url.startswith("http://") and self.base.startswith("https://"):
            if self.http_redirect:
                return health.Resp(301, {"location": "https://" + url[len("http://"):]}, b"")
            return health.Resp(200, dict(self.headers), page("Penny Paws Games"))
        if url in self.elsewhere:
            return self.elsewhere[url]
        assert url.startswith(self.base), f"request left the site: {url}"
        path = url[len(self.base):] or "/"
        status, extra, body = self.routes.get(path, (404, {}, page("Page not found")))
        return health.Resp(status, {**self.headers, **extra}, body)

    def run(self, expect: str = "auto") -> health.Health:
        return health.Health(self.base, self, SPEC, expect).run(wait=0)


def failed(h: health.Health) -> list[str]:
    return [c.name for c in h.checks if not c.ok]


class HealthyTest(unittest.TestCase):
    def test_staging_passes(self):
        h = Site().run()
        self.assertEqual(failed(h), [])
        self.assertEqual(h.expect, "staging")
        names = [c.name for c in h.checks]
        for want in ("exact /app-ads.txt", "page /", "page /squishy-bop/privacy/",
                     "no script from another origin", "noindex (not the public address)",
                     "a missing page answers 404", "repository files are not served",
                     "http redirects to https"):
            self.assertIn(want, names)

    def test_production_passes_and_is_detected_from_the_host(self):
        h = Site("https://pennypawsgames.com", indexable=True).run()
        self.assertEqual(failed(h), [])
        self.assertEqual(h.expect, "production")

    def test_local_server_uses_staging_rules_and_skips_the_https_check(self):
        h = Site("http://127.0.0.1:8787").run()
        self.assertEqual(failed(h), [])
        self.assertNotIn("http redirects to https", [c.name for c in h.checks])

    def test_workers_dev_is_not_the_public_address(self):
        h = Site("https://pennypaws-site.example.workers.dev").run()
        self.assertEqual(h.expect, "staging")
        self.assertEqual(failed(h), [])
        self.assertNotIn("http redirects to https", [c.name for c in h.checks])

    def test_a_local_server_can_stand_in_for_production(self):
        h = Site("http://127.0.0.1:8788", indexable=True).run("production")
        self.assertEqual(failed(h), [])

    def test_it_never_leaves_the_site(self):
        s = Site()
        s.run()
        self.assertTrue(all("staging.pennypawsgames.com" in u for u in s.requests), s.requests)


class BrokenTest(unittest.TestCase):
    def test_unreachable(self):
        s = Site()
        s.routes["/"] = (503, {}, b"")
        h = s.run()
        self.assertEqual(failed(h), ["reachable"])
        self.assertTrue(h.failed)

    def test_connection_error_is_a_failure_not_a_crash(self):
        def down(url: str) -> health.Resp:
            raise ConnectionRefusedError("refused")

        h = health.Health("http://127.0.0.1:9", down, SPEC).run(wait=0)
        self.assertEqual(failed(h), ["reachable"])

    def test_app_ads_one_byte_off(self):
        for body in (APP_ADS[:-1],                           # no final newline
                     APP_ADS[:-1] + b"\r\n",                 # CRLF
                     APP_ADS.replace(b"397", b"398"),        # wrong publisher id
                     b"\xef\xbb\xbf" + APP_ADS):             # byte order mark
            s = Site()
            s.routes["/app-ads.txt"] = (200, {"content-type": "text/plain"}, body)
            self.assertEqual(failed(s.run()), ["exact /app-ads.txt"], body)

    def test_app_ads_missing_or_wrong_type(self):
        s = Site()
        del s.routes["/app-ads.txt"]
        self.assertEqual(failed(s.run()), ["exact /app-ads.txt"])
        s = Site()
        s.routes["/app-ads.txt"] = (200, {"content-type": "text/html"}, APP_ADS)
        self.assertEqual(failed(s.run()), ["exact /app-ads.txt"])

    def test_privacy_page_missing(self):
        s = Site()
        del s.routes["/squishy-bop/privacy/"]
        self.assertIn("page /squishy-bop/privacy/", failed(s.run()))

    def test_privacy_page_wrong_title(self):
        s = Site()
        s.routes["/squishy-bop/privacy/"] = (200, {}, page("Privacy"))
        self.assertEqual(failed(s.run()), ["page /squishy-bop/privacy/"])

    def test_cache_control_without_no_transform(self):
        s = Site()
        s.headers["cache-control"] = "public, max-age=0, must-revalidate"
        self.assertEqual(failed(s.run()), ["page /", "page /squishy-bop/privacy/"])

    def test_missing_security_header(self):
        for name in ("content-security-policy", "strict-transport-security",
                     "x-content-type-options", "referrer-policy", "cache-control"):
            s = Site()
            del s.headers[name]
            self.assertEqual(failed(s.run()), ["page /", "page /squishy-bop/privacy/"], name)

    def test_weak_header_value(self):
        s = Site()
        s.headers["content-security-policy"] = "default-src *"
        self.assertEqual(failed(s.run()), ["page /", "page /squishy-bop/privacy/"])

    def test_outside_script_on_a_listed_page(self):
        s = Site()
        s.routes["/"] = (200, {}, page("Penny Paws Games", '<script src="https://cdn.example.com/a.js"></script>'))
        self.assertEqual(failed(s.run()), ["no script from another origin"])

    def test_outside_script_on_a_page_only_reachable_by_a_link(self):
        s = Site()
        s.routes["/"] = (200, {}, page("Penny Paws Games", '<a href="/games/">Games</a>'))
        s.routes["/games/"] = (200, {}, page("Games", '<script src="//cdn.example.com/a.js"></script>'))
        self.assertEqual(failed(s.run()), ["no script from another origin"])

    def test_own_scripts_are_fine(self):
        s = Site()
        s.routes["/"] = (200, {}, page("Penny Paws Games", '<script src="/app.js"></script><script>1</script>'))
        self.assertEqual(failed(s.run()), [])

    def test_broken_own_link(self):
        s = Site()
        s.routes["/"] = (200, {}, page("Penny Paws Games", '<a href="/gone/">Gone</a>'))
        self.assertEqual(failed(s.run()), ["the site's own links answer"])

    def test_staging_without_noindex(self):
        s = Site(indexable=True)
        self.assertEqual(failed(s.run()), ["noindex (not the public address)"])

    def test_production_with_noindex(self):
        s = Site("https://pennypawsgames.com", indexable=False)
        self.assertEqual(failed(s.run()), ["indexable (production)"])

    def test_missing_page_answers_200(self):
        s = Site()
        s.routes[health.MISSING_PATH] = (200, {}, page("Penny Paws Games"))
        self.assertEqual(failed(s.run()), ["a missing page answers 404"])

    def test_repository_file_served(self):
        s = Site()
        s.routes["/wrangler.jsonc"] = (200, {"content-type": "application/json"}, b"{}")
        self.assertEqual(failed(s.run()), ["repository files are not served"])

    def test_www_not_redirecting_to_the_same_path(self):
        entry = SPEC["redirect"][0]
        for resp in (health.Resp(200, {}, b""), health.Resp(302, {"location": entry["to"]}, b""),
                     health.Resp(301, {"location": "https://pennypawsgames.com/"}, b"")):
            s = Site("https://pennypawsgames.com", indexable=True)
            s.elsewhere[entry["from"]] = resp
            self.assertEqual(failed(s.run()), [f"redirect {entry['from']}"], resp)

    def test_redirects_are_only_checked_on_the_public_address(self):
        s = Site()
        s.elsewhere.clear()
        self.assertEqual(failed(s.run()), [])
        self.assertFalse([c for c in s.run().checks if c.name.startswith("redirect ")])

    def test_http_not_redirected(self):
        s = Site()
        s.http_redirect = False
        self.assertEqual(failed(s.run()), ["http redirects to https"])


class OutputTest(unittest.TestCase):
    def test_markdown_table(self):
        md = Site().run().markdown()
        self.assertIn("all checks passed", md)
        self.assertIn("| exact /app-ads.txt | pass |", md)

    def test_exit_code_and_files(self):
        real = health.urllib_http
        health.urllib_http = lambda timeout=30: Site()
        try:
            with redirect_stdout(io.StringIO()), tempfile.TemporaryDirectory() as d:
                out = Path(d) / "h.json"
                code = health.main(["https://staging.pennypawsgames.com", "--wait", "0", "--json", str(out)])
                self.assertEqual(code, 0)
                self.assertFalse(json.loads(out.read_text())["failed"])
            bad = Site(indexable=True)
            health.urllib_http = lambda timeout=30: bad
            with redirect_stdout(io.StringIO()):
                self.assertEqual(health.main(["https://staging.pennypawsgames.com", "--wait", "0"]), 1)
        finally:
            health.urllib_http = real


class NeverBreakListTest(unittest.TestCase):
    """The list itself: its entries match the repository's files."""

    def test_app_ads_file_is_the_listed_bytes(self):
        entry = next(e for e in SPEC["exact"] if e["path"] == "/app-ads.txt")
        self.assertEqual((ROOT / "app-ads.txt").read_bytes(), entry["body"].encode())
        self.assertEqual(entry["body"].encode(), APP_ADS)

    def test_listed_pages_exist_with_their_titles(self):
        for p in SPEC["page"]:
            file = ROOT / p["path"].strip("/") / "index.html"
            self.assertEqual(health.parse_page(file.read_text(encoding="utf-8")).title, p["title"], p["path"])

    def test_every_entry_says_why(self):
        for e in SPEC["exact"] + SPEC["page"]:
            self.assertGreater(len(e.get("why", "")), 20, e["path"])

    def test_first_entries_are_still_listed(self):
        self.assertIn("/app-ads.txt", [e["path"] for e in SPEC["exact"]])
        self.assertIn("/squishy-bop/privacy/", [p["path"] for p in SPEC["page"]])
        self.assertIn("/", [p["path"] for p in SPEC["page"]])
        for h in ("content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy",
                  "cache-control"):
            self.assertIn(h, SPEC["headers"])
        self.assertEqual(SPEC["production_host"], "pennypawsgames.com")


if __name__ == "__main__":
    unittest.main()

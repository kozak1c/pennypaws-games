"""ops/check_site.py: the real site passes, and each kind of mistake is caught on a tiny fake site."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ops"))

import check_site  # noqa: E402

HEAD = '<meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>T</title>'


def html(body: str = "", head: str = HEAD, lang: str = ' lang="en"', doctype: str = "<!doctype html>") -> str:
    return f"{doctype}\n<html{lang}><head>{head}</head><body>{body}</body></html>"


def run(files: dict[str, str]) -> check_site.Report:
    with tempfile.TemporaryDirectory() as d:
        for name, text in files.items():
            p = Path(d) / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")
        return check_site.check(Path(d), list(files))


class RealSiteTest(unittest.TestCase):
    def test_the_site_passes(self):
        rep = check_site.check()
        self.assertEqual(rep.errors, [])

    def test_allow_list_names_the_pages_that_exist_today(self):
        files = check_site.read_public_files()
        for f in ("index.html", "404.html", "app-ads.txt", "squishy-bop/privacy/index.html"):
            self.assertIn(f, files)


class StructureTest(unittest.TestCase):
    def test_a_good_page_passes(self):
        self.assertEqual(run({"index.html": html('<a href="a/">a</a>'), "a/index.html": html()}).errors, [])

    def test_missing_pieces(self):
        cases = {
            "doctype": html(doctype=""),
            "lang": html(lang=""),
            "charset": html(head='<meta name="viewport" content="x"><title>T</title>'),
            "viewport": html(head='<meta charset="utf-8"><title>T</title>'),
            "title": html(head='<meta charset="utf-8"><meta name="viewport" content="x">'),
            "duplicate id": html('<p id="x"></p><p id="x"></p>'),
            "base": html(head=HEAD + '<base href="/x/">'),
        }
        for what, text in cases.items():
            rep = run({"index.html": text})
            self.assertEqual(len(rep.errors), 1, (what, rep.errors))
            self.assertIn(what, rep.errors[0])

    def test_missing_file_and_budget(self):
        with tempfile.TemporaryDirectory() as d:
            rep = check_site.check(Path(d), ["index.html"])
            self.assertIn("does not exist", rep.errors[0])
        big = html("x" * (check_site.MAX_HTML_BYTES + 1))
        self.assertIn("budget", run({"index.html": big}).errors[0])


class LinkTest(unittest.TestCase):
    def test_inside_links_resolve_like_cloudflare_serves_them(self):
        site = {
            "index.html": html('<a href="a/">1</a><a href="/a">2</a><a href="about">3</a>'
                               '<a href="/a/#top">4</a><a href="a/index.html">5</a><a href="/file.txt">6</a>'),
            "a/index.html": html('<h1 id="top">x</h1><a href="../">home</a><a href="../about">about</a>'),
            "about.html": html(),
            "file.txt": "x",
        }
        self.assertEqual(run(site).errors, [])

    def test_broken_inside_link(self):
        rep = run({"index.html": html('<a href="missing/">x</a>')})
        self.assertIn("not a public file", rep.errors[0])

    def test_link_to_a_file_that_exists_but_is_not_public(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "index.html").write_text(html('<a href="README.md">x</a>'), encoding="utf-8")
            (Path(d) / "README.md").write_text("x", encoding="utf-8")
            rep = check_site.check(Path(d), ["index.html"])
        self.assertIn("not a public file", rep.errors[0])

    def test_missing_fragment(self):
        rep = run({"index.html": html('<a href="#nope">x</a>')})
        self.assertIn("no element with id", rep.errors[0])

    def test_outside_links(self):
        rep = run({"index.html": html('<a href="https://example.com/">ok</a><a href="mailto:a@example.com">m</a>'
                                      '<a href="tel:+15555550100">t</a>')})
        self.assertEqual(rep.errors, [])
        self.assertEqual(rep.external, [("index.html", "https://example.com/")])
        self.assertIn("uses http", run({"index.html": html('<a href="http://example.com/">x</a>')}).errors[0])
        self.assertIn("unexpected scheme", run({"index.html": html('<a href="javascript:alert(1)">x</a>')}).errors[0])

    def test_own_host_must_be_a_path(self):
        rep = run({"index.html": html('<a href="https://pennypawsgames.com/">x</a>')})
        self.assertIn("use a path", rep.errors[0])

    def test_404_page_must_use_absolute_paths(self):
        site = {"index.html": html(), "404.html": html('<a href="index.html">home</a>')}
        self.assertIn("served at every depth", run(site).errors[0])
        site["404.html"] = html('<a href="/">home</a>')
        self.assertEqual(run(site).errors, [])


class OutsideResourceTest(unittest.TestCase):
    def test_nothing_loads_from_another_origin(self):
        cases = [
            '<script src="https://cdn.example.com/a.js"></script>',
            '<script src="//cdn.example.com/a.js"></script>',
            '<img src="https://example.com/pixel.gif" alt="">',
            '<img srcset="https://example.com/a.png 2x" alt="">',
            '<iframe src="https://example.com/"></iframe>',
            '<video poster="https://example.com/p.jpg"></video>',
            '<form action="https://example.com/post"></form>',
        ]
        for body in cases:
            rep = run({"index.html": html(body)})
            self.assertEqual(len(rep.errors), 1, (body, rep.errors))
            self.assertIn("another origin", rep.errors[0])
        for head in ('<link rel="stylesheet" href="https://fonts.googleapis.com/css">',
                     '<link rel="preconnect" href="https://fonts.gstatic.com">',
                     '<meta http-equiv="refresh" content="0; url=https://example.com/">'):
            rep = run({"index.html": html(head=HEAD + head)})
            self.assertEqual(len(rep.errors), 1, (head, rep.errors))
            self.assertIn("another origin", rep.errors[0])

    def test_own_resources_must_be_public_files(self):
        self.assertEqual(run({"index.html": html('<script src="/app.js"></script><img src="data:image/png;base64,AA" alt="">'),
                              "app.js": "1"}).errors, [])
        self.assertIn("not a public file", run({"index.html": html('<img src="logo.png" alt="">')}).errors[0])


class AddressTest(unittest.TestCase):
    def test_url_path_of(self):
        self.assertEqual(check_site.url_path_of("index.html"), "/")
        self.assertEqual(check_site.url_path_of("squishy-bop/privacy/index.html"), "/squishy-bop/privacy/")
        self.assertEqual(check_site.url_path_of("404.html"), "/404")
        self.assertEqual(check_site.url_path_of("app-ads.txt"), "/app-ads.txt")


if __name__ == "__main__":
    unittest.main()

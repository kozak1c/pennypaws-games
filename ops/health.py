"""Health check for one address the Penny Paws site is served from.

    python ops/health.py https://pennypawsgames.com
    python ops/health.py https://staging.pennypawsgames.com --markdown health.md
    python ops/health.py http://127.0.0.1:8787 --expect staging

Standard library only (Python 3.11 or later), so it runs on a bare GitHub runner and on any
PC alike. It reads the never-break list in ops/never-break.toml and checks, against the one
address it is given:

  * every "exact" file answers 200 with exactly the listed bytes (app-ads.txt for AdMob)
  * every listed page answers 200 as HTML with its title
  * every page sends the listed security headers
  * no page loads a script from another origin (it follows the site's own links to find pages)
  * indexing: the public address must not send "X-Robots-Tag: noindex"; every other address
    (staging, pull request previews, workers.dev, a local server) must send it
  * a missing page answers 404, and repository files that are not part of the site answer 404
  * over HTTPS on our own domain, the plain http:// address redirects to https://

--expect says which indexing rule applies: "production" (must be indexable) or "staging"
(must be noindex; also right for previews and local servers). The default, "auto", decides
from the host name: production_host in the never-break list is production, anything else is
staging.

Exit code 0 when nothing failed, else 1.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import tomllib
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

NEVER_BREAK = Path(__file__).resolve().parent / "never-break.toml"
USER_AGENT = "pennypaws-health/1 (+https://github.com/kozak1c/pennypaws-games)"
MISSING_PATH = "/this-page-does-not-exist-health-check"
MAX_PAGES = 40  # pages followed from the listed ones when looking for scripts


@dataclass
class Resp:
    status: int
    headers: dict[str, str]
    body: bytes

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", "replace")


# (absolute url) -> Resp, never following a redirect
Http = Callable[[str], Resp]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


def urllib_http(timeout: float = 30) -> Http:
    opener = urllib.request.build_opener(_NoRedirect)

    def call(url: str) -> Resp:
        req = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
        try:
            with opener.open(req, timeout=timeout) as r:
                return Resp(r.status, {k.lower(): v for k, v in r.headers.items()}, r.read())
        except urllib.error.HTTPError as e:
            return Resp(e.code, {k.lower(): v for k, v in e.headers.items()}, e.read())

    return call


class _Page(HTMLParser):
    """The title, the script sources and the links of one HTML page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: str | None = None
        self.scripts: list[str] = []
        self.links: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag == "title" and self.title is None:
            self._in_title, self.title = True, ""
        elif tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title = (self.title or "") + data


def parse_page(html: str) -> _Page:
    p = _Page()
    p.feed(html)
    p.close()
    return p


def origin(url: str) -> tuple[str, str]:
    u = urlsplit(url)
    return (u.scheme.lower(), u.netloc.lower())


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""

    @property
    def mark(self) -> str:
        return "pass" if self.ok else "FAIL"


@dataclass
class Health:
    base: str
    http: Http
    spec: dict
    expect: str = "auto"  # production | staging | auto
    checks: list[Check] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.base = self.base.rstrip("/")
        if self.expect == "auto":
            host = (urlsplit(self.base).hostname or "").lower()
            self.expect = "production" if host == self.spec["production_host"] else "staging"

    # -- plumbing

    def add(self, name: str, ok: bool, detail: str = "") -> bool:
        self.checks.append(Check(name, bool(ok), detail[:300]))
        return bool(ok)

    def get(self, path: str, follow: int = 3) -> Resp:
        """GET a path (or absolute URL), following up to `follow` redirects on the same origin."""
        url = urljoin(self.base + "/", path.lstrip("/")) if not path.startswith("http") else path
        r = self.http(url)
        while follow and r.status in (301, 302, 303, 307, 308) and r.headers.get("location"):
            nxt = urljoin(url, r.headers["location"])
            if origin(nxt) != origin(self.base):
                break
            url, follow = nxt, follow - 1
            r = self.http(url)
        return r

    @property
    def failed(self) -> bool:
        return any(not c.ok for c in self.checks)

    # -- checks

    def wait_ready(self, timeout: float) -> bool:
        """The home page answers 200 (waits out a deploy that is still spreading)."""
        end = time.monotonic() + timeout
        while True:
            try:
                r = self.get("/")
                detail = f"HTTP {r.status}"
                if r.status == 200:
                    return self.add("reachable", True, f"{self.base} answers 200")
            except Exception as exc:  # connection refused, DNS not there yet, TLS not ready
                detail = f"{type(exc).__name__}: {exc}"
            if time.monotonic() >= end:
                return self.add("reachable", False, detail)
            time.sleep(5)

    def exact(self) -> None:
        for e in self.spec.get("exact", []):
            r = self.get(e["path"])
            want = e["body"].encode("utf-8")
            problems = []
            if r.status != 200:
                problems.append(f"HTTP {r.status}")
            elif r.body != want:
                problems.append(f"body differs: got {r.body[:80]!r}, want {want[:80]!r}")
            ctype = r.headers.get("content-type", "")
            if e.get("content_type") and not ctype.startswith(e["content_type"]):
                problems.append(f"content-type {ctype!r}")
            self.add(f"exact {e['path']}", not problems,
                     "; ".join(problems) or f"{len(want)} bytes match")

    def pages(self) -> dict[str, _Page]:
        """Check the listed pages; return every HTML page found, by path, for the later checks."""
        found: dict[str, _Page] = {}
        for p in self.spec.get("page", []):
            r = self.get(p["path"])
            problems = []
            title = None
            if r.status != 200:
                problems.append(f"HTTP {r.status}")
            elif not r.headers.get("content-type", "").startswith("text/html"):
                problems.append(f"not HTML ({r.headers.get('content-type', '')!r})")
            else:
                page = parse_page(r.text)
                found[p["path"]] = page
                title = (page.title or "").strip()
                if title != p["title"]:
                    problems.append(f"title {title!r}, want {p['title']!r}")
                missing = self.missing_headers(r)
                if missing:
                    problems.append("headers: " + ", ".join(missing))
            self.add(f"page {p['path']}", not problems, "; ".join(problems) or f"200, title {title!r}")
        return found

    def missing_headers(self, r: Resp) -> list[str]:
        out = []
        for name, want in self.spec.get("headers", {}).items():
            got = r.headers.get(name.lower())
            if got is None:
                out.append(f"no {name}")
            elif want and want.lower() not in got.lower():
                out.append(f"{name} is {got!r}, want it to contain {want!r}")
        return out

    def scripts(self, found: dict[str, _Page]) -> None:
        """No page loads a script from another origin. Follows same-origin links to find pages."""
        queue = list(found)
        seen = set(queue)
        bad: list[str] = []
        unreadable: list[str] = []
        checked = 0
        while queue and checked < MAX_PAGES:
            path = queue.pop(0)
            page = found.get(path)
            if page is None:
                r = self.get(path)
                if r.status != 200:
                    unreadable.append(f"{path}: HTTP {r.status}")
                    continue
                if not r.headers.get("content-type", "").startswith("text/html"):
                    continue
                page = parse_page(r.text)
            checked += 1
            here = urljoin(self.base + "/", path.lstrip("/"))
            for src in page.scripts:
                if origin(urljoin(here, src)) != origin(self.base):
                    bad.append(f"{path} loads {src}")
            for href in page.links:
                u = urlsplit(urljoin(here, href))
                if u.scheme not in ("http", "https") or origin(u.geturl()) != origin(self.base):
                    continue
                nxt = u.path or "/"
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        self.add("no script from another origin", not bad,
                 "; ".join(bad) or f"{checked} page(s) checked")
        self.add("the site's own links answer", not unreadable,
                 "; ".join(unreadable) or f"{len(seen)} address(es) followed")

    def indexing(self) -> None:
        r = self.get("/")
        tag = r.headers.get("x-robots-tag", "")
        if self.expect == "production":
            self.add("indexable (production)", "noindex" not in tag.lower(), f"x-robots-tag={tag!r}")
        else:
            self.add("noindex (not the public address)", "noindex" in tag.lower(), f"x-robots-tag={tag!r}")

    def not_found(self) -> None:
        r = self.get(MISSING_PATH)
        self.add("a missing page answers 404", r.status == 404, f"HTTP {r.status}")
        served = []
        for path in self.spec.get("absent", {}).get("paths", []):
            status = self.get(path).status
            if status != 404:
                served.append(f"{path}: HTTP {status}")
        self.add("repository files are not served", not served,
                 "; ".join(served) or f"{len(self.spec.get('absent', {}).get('paths', []))} path(s) answer 404")

    def https_only(self) -> None:
        """On our own domain over HTTPS, the plain http:// address redirects to https://."""
        u = urlsplit(self.base)
        host = (u.hostname or "").lower()
        prod = self.spec["production_host"]
        if u.scheme != "https" or not (host == prod or host.endswith("." + prod)):
            return
        try:
            r = self.http(f"http://{u.netloc}/")
            loc = r.headers.get("location", "")
            ok = r.status in (301, 308) and loc.startswith(f"https://{u.netloc}")
            self.add("http redirects to https", ok, f"HTTP {r.status} -> {loc or 'no location'}")
        except Exception as exc:
            self.add("http redirects to https", False, f"{type(exc).__name__}: {exc}")

    def run(self, wait: float = 60) -> Health:
        if not self.wait_ready(wait):
            return self
        self.exact()
        found = self.pages()
        self.scripts(found)
        self.indexing()
        self.not_found()
        self.https_only()
        return self

    # -- output

    def markdown(self) -> str:
        fails = sum(1 for c in self.checks if not c.ok)
        head = "all checks passed" if not fails else f"{fails} check(s) failed"
        lines = [f"**Health check of {self.base} ({self.expect} rules): {head}.**", "",
                 "| Check | Result | Detail |", "|---|---|---|"]
        for c in self.checks:
            detail = c.detail.replace("|", "\\|").replace("\n", " ")
            lines.append(f"| {c.name} | {c.mark} | {detail} |")
        return "\n".join(lines) + "\n"


def load_spec(path: Path = NEVER_BREAK) -> dict:
    with open(path, "rb") as f:
        return tomllib.load(f)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    ap.add_argument("base_url")
    ap.add_argument("--expect", choices=["production", "staging", "auto"], default="auto",
                    help="indexing rule: production must be indexable, staging must be noindex; "
                         "auto decides from the host name (default)")
    ap.add_argument("--wait", type=float, default=60, help="seconds to wait for the home page")
    ap.add_argument("--never-break", default=str(NEVER_BREAK), help="the never-break list to read")
    ap.add_argument("--markdown", help="write a Markdown table here")
    ap.add_argument("--json", dest="json_out", help="write the results as JSON here")
    args = ap.parse_args(argv)
    if urlsplit(args.base_url).scheme not in ("http", "https"):
        ap.error("base_url must start with http:// or https://")
    health = Health(args.base_url, urllib_http(), load_spec(Path(args.never_break)), args.expect)
    health.run(args.wait)
    print(f"{health.base} ({health.expect} rules)")
    for c in health.checks:
        print(f"{c.mark:4}  {c.name}: {c.detail}")
    if args.markdown:
        with open(args.markdown, "w", encoding="utf-8") as f:
            f.write(health.markdown())
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump({"base": health.base, "expect": health.expect, "failed": health.failed,
                       "checks": [c.__dict__ for c in health.checks]}, f, indent=2)
    return 1 if health.failed else 0


if __name__ == "__main__":
    sys.exit(main())

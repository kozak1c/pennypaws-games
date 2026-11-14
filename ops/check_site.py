"""Check the site's files before anything serves them: structure, links, outside resources, size.

    python ops/check_site.py              # every file in ops/public-files.txt
    python ops/check_site.py --external   # also fetch outside links (warnings only)

Standard library only. It reads the allow-list of public files (ops/public-files.txt) and
checks each HTML page:

  * it starts with <!doctype html>, has <html lang>, a charset, a viewport and one <title>
  * no two elements share an id
  * every link and resource that points inside the site resolves to a public file, the way
    Cloudflare serves them ("/a/" is a/index.html, "/a" is a.html or a/index.html), and a
    "#fragment" exists on its page
  * nothing is loaded from another origin: no outside script, style, image, font, frame or
    media. Children open these pages; an outside resource is a request to a third party.
  * outside links (<a href>) use https, mailto or tel
  * the file is within the size budget

It also checks that every allow-listed file exists and that the budget holds for the rest.
html-validate (npm run lint:html) checks the markup itself; this script checks what the
pages point at.

Exit code 0 when nothing failed, else 1. Outside links that do not answer are warnings: a
third party's outage must not block a release.
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_FILES = ROOT / "ops" / "public-files.txt"
SITE = "https://pennypawsgames.com"  # only used to resolve relative links; nothing is fetched from it
MAX_HTML_BYTES = 150 * 1024
MAX_FILE_BYTES = 2 * 1024 * 1024

# attribute -> tags whose value is a resource the browser loads by itself
RESOURCE_ATTRS = {
    "src": {"script", "img", "iframe", "embed", "audio", "video", "source", "track", "input"},
    "data": {"object"},
    "poster": {"video"},
}
# <link rel> values that make the browser fetch the href
LOADING_RELS = {"stylesheet", "icon", "apple-touch-icon", "manifest", "preload", "modulepreload",
                "prefetch", "preconnect", "dns-prefetch"}


def read_public_files(path: Path = PUBLIC_FILES) -> list[str]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out


class _Doc(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.doctype: str | None = None
        self.first_is_doctype = False
        self._seen_anything = False
        self.lang: str | None = None
        self.charset = False
        self.viewport = False
        self.titles = 0
        self.ids: list[str] = []
        self.links: list[str] = []       # <a href>, <area href>
        self.resources: list[tuple[str, str]] = []  # (tag, url) the browser loads by itself
        self.base_href: str | None = None

    def handle_decl(self, decl: str) -> None:
        if not self._seen_anything:
            self.first_is_doctype = True
        self._seen_anything = True
        self.doctype = decl

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._seen_anything = True
        a = {k: (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "meta":
            if "charset" in a:
                self.charset = True
            if a.get("name", "").lower() == "viewport":
                self.viewport = True
            if a.get("http-equiv", "").lower() == "refresh":
                self.resources.append(("meta refresh", a.get("content", "").partition("=")[2].strip()))
        if tag == "title":
            self.titles += 1
        if tag == "base" and "href" in a:
            self.base_href = a["href"]
        if a.get("id"):
            self.ids.append(a["id"])
        if tag in ("a", "area") and "href" in a:
            self.links.append(a["href"])
        if tag == "link" and "href" in a:
            rels = set(a.get("rel", "").lower().split())
            if rels & LOADING_RELS:
                self.resources.append((f"link rel={a.get('rel', '')}", a["href"]))
            else:
                self.links.append(a["href"])
        for attr, tags in RESOURCE_ATTRS.items():
            if tag in tags and a.get(attr):
                self.resources.append((tag, a[attr]))
        if a.get("srcset"):
            for part in a["srcset"].split(","):
                url = part.strip().split(" ")[0]
                if url:
                    self.resources.append((f"{tag} srcset", url))
        if tag == "form" and a.get("action"):
            self.resources.append(("form action", a["action"]))

    def handle_data(self, data: str) -> None:
        if data.strip():
            self._seen_anything = True


def parse(html: str) -> _Doc:
    d = _Doc()
    d.feed(html)
    d.close()
    return d


def url_path_of(file: str) -> str:
    """The address a public file is served at: a/index.html -> /a/, a.html -> /a, else /file."""
    p = PurePosixPath(file)
    if p.name == "index.html":
        parent = p.parent.as_posix()
        return "/" if parent == "." else f"/{parent}/"
    if p.suffix == ".html":
        return "/" + p.with_suffix("").as_posix()
    return "/" + p.as_posix()


def resolve(path: str, public: set[str]) -> str | None:
    """The public file an address serves, or None. Mirrors Cloudflare's auto-trailing-slash."""
    clean = unquote(path).lstrip("/")
    candidates = []
    if clean == "" or clean.endswith("/"):
        candidates.append(f"{clean}index.html")
    else:
        candidates += [clean, f"{clean}.html", f"{clean}/index.html"]
    for c in candidates:
        if c in public:
            return c
    return None


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    external: list[tuple[str, str]] = field(default_factory=list)  # (file, url)

    def error(self, file: str, msg: str) -> None:
        self.errors.append(f"{file}: {msg}")


def check_page(file: str, html: str, docs: dict[str, _Doc], public: set[str], rep: Report) -> None:
    d = docs[file]
    if not d.first_is_doctype or (d.doctype or "").lower() != "doctype html":
        rep.error(file, "must start with <!doctype html>")
    if not d.lang:
        rep.error(file, "<html> needs a lang attribute")
    if not d.charset:
        rep.error(file, "needs <meta charset>")
    if not d.viewport:
        rep.error(file, 'needs <meta name="viewport">')
    if d.titles != 1:
        rep.error(file, f"needs exactly one <title>, found {d.titles}")
    dupes = sorted({i for i in d.ids if d.ids.count(i) > 1})
    if dupes:
        rep.error(file, f"duplicate id(s): {', '.join(dupes)}")
    if d.base_href is not None:
        rep.error(file, "<base href> is not allowed: it silently changes every relative link")

    if file == "404.html":
        # Served for any missing address, at any depth, so a relative link would break.
        for _, raw in [("", r) for r in d.links] + d.resources:
            if not raw.strip().startswith(("/", "https:", "mailto:", "tel:", "data:")) or raw.strip().startswith("//"):
                rep.error(file, f"{raw!r} is relative; the 404 page is served at every depth, so start it with /")

    here = SITE + url_path_of(file)

    def inside(url: str) -> bool:
        return urlsplit(url).netloc == urlsplit(SITE).netloc and urlsplit(url).scheme == "https"

    def check_inside(kind: str, raw: str, url: str) -> None:
        u = urlsplit(url)
        target = resolve(u.path, public)
        if target is None:
            rep.error(file, f"{kind} {raw!r} points at {u.path}, which is not a public file")
        elif u.fragment and target in docs and unquote(u.fragment) not in docs[target].ids:
            rep.error(file, f"{kind} {raw!r}: no element with id {u.fragment!r} in {target}")

    for tag, raw in d.resources:
        url = urljoin(here, raw.strip())
        if urlsplit(url).scheme == "data":
            continue
        if inside(url):
            check_inside(tag, raw, url)
        else:
            rep.error(file, f"<{tag}> loads {raw!r} from another origin; host the file on the site instead")

    for raw in d.links:
        url = urljoin(here, raw.strip())
        scheme = urlsplit(url).scheme
        if scheme in ("mailto", "tel"):
            continue
        if scheme == "http":
            rep.error(file, f"link {raw!r} uses http; use https")
        elif scheme != "https":
            rep.error(file, f"link {raw!r} has an unexpected scheme {scheme!r}")
        elif inside(url):
            if raw.strip().startswith(("http:", "https:", "//")):
                rep.error(file, f"link {raw!r} names the site's own host; use a path so it works on staging and previews")
            check_inside("link", raw, url)
        else:
            rep.external.append((file, url))


def check_external(rep: Report, timeout: float = 15) -> None:
    seen: dict[str, str] = {}
    for file, url in rep.external:
        if url not in seen:
            req = urllib.request.Request(url.split("#")[0], headers={"user-agent": "Mozilla/5.0 (pennypaws link check)"})
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
                    seen[url] = "" if r.status < 400 else f"HTTP {r.status}"
            except urllib.error.HTTPError as e:
                seen[url] = f"HTTP {e.code}"
            except Exception as e:  # DNS, TLS, timeout
                seen[url] = f"{type(e).__name__}: {e}"
        if seen[url]:
            rep.warnings.append(f"{file}: outside link {url} did not answer ({seen[url]})")


def check(root: Path = ROOT, public_files: list[str] | None = None, external: bool = False) -> Report:
    files = public_files if public_files is not None else read_public_files()
    public = set(files)
    rep = Report()
    docs: dict[str, _Doc] = {}
    texts: dict[str, str] = {}
    for f in files:
        p = root / f
        if not p.is_file():
            rep.error(f, "is in ops/public-files.txt but does not exist")
            continue
        size = p.stat().st_size
        limit = MAX_HTML_BYTES if f.endswith(".html") else MAX_FILE_BYTES
        if size > limit:
            rep.error(f, f"is {size} bytes, over the {limit} byte budget")
        if f.endswith(".html"):
            try:
                texts[f] = p.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                rep.error(f, "is not valid UTF-8")
                continue
            docs[f] = parse(texts[f])
    for f in docs:
        check_page(f, texts[f], docs, public, rep)
    if external:
        check_external(rep)
    return rep


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    ap.add_argument("--external", action="store_true", help="also fetch outside links (warnings only)")
    args = ap.parse_args(argv)
    rep = check(external=args.external)
    for w in rep.warnings:
        print(f"::warning::{w}" if args.external else f"warn  {w}")
    for e in rep.errors:
        print(f"FAIL  {e}")
    pages = sum(1 for f in read_public_files() if f.endswith(".html"))
    print(f"{pages} page(s), {len(rep.external)} outside link(s), "
          f"{len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())

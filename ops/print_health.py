"""Check only the print service's public health report; no sign-in or customer data.

    python ops/print_health.py https://print.pennypawsgames.com --markdown health.md

A healthy production service answers 200 with ok=true, environment=production,
etsy_mode=live and etsy=ok. A seeded staging service is not a production success.
Only fixed status descriptions are reported; response bodies are never copied into alerts.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.error import URLError

from health import Http, urllib_http


def check(base: str, http: Http) -> tuple[bool, str]:
    try:
        response = http(base.rstrip("/") + "/api/health")
    except (OSError, URLError, TimeoutError):
        return False, "The public health endpoint did not answer."
    if response.status != 200:
        return False, f"The public health endpoint answered HTTP {response.status}."
    try:
        body = json.loads(response.body)
    except (ValueError, UnicodeError):
        return False, "The public health endpoint did not return JSON."
    if not isinstance(body, dict):
        return False, "The public health endpoint did not return an object."
    if body.get("environment") != "production" or body.get("etsy_mode") != "live":
        return False, "The public health endpoint is not a live production service."
    if body.get("ok") is not True or body.get("etsy") != "ok":
        return False, "The public health endpoint reports that the service is not ready."
    return True, "The public production health endpoint reports ready."


def main(argv: list[str] | None = None, http: Http | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base")
    parser.add_argument("--markdown", type=Path)
    args = parser.parse_args(argv)
    ok, detail = check(args.base, http or urllib_http(timeout=20))
    report = f"### Print service health\n\n{'PASS' if ok else 'FAIL'}: {detail}\n"
    print(report, end="")
    if args.markdown:
        args.markdown.write_text(report, encoding="utf-8")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

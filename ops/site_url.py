"""Print the address a deploy went to, read from wrangler's own output file.

    WRANGLER_OUTPUT_FILE_PATH=deploy.ndjson npx wrangler deploy --env staging
    python ops/site_url.py deploy.ndjson            # https://staging.pennypawsgames.com
    python ops/site_url.py deploy.ndjson --field version_id

The workflows health-check the address wrangler says it deployed to, so the check follows the
configuration: a custom domain when the Worker has one, its workers.dev address when it does
not (production before the domain moves to Cloudflare). Standard library only.

Wrangler writes one JSON object per line. The "deploy" entry lists its targets as text:
"https://name.account.workers.dev" for workers.dev and "host (custom domain)" for a custom
domain. A custom domain wins.
"""

from __future__ import annotations

import argparse
import json
import sys


def deploy_entry(text: str) -> dict:
    entry = None
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if isinstance(obj, dict) and obj.get("type") == "deploy":
            entry = obj  # the last one wins
    if entry is None:
        raise ValueError("no deploy entry in the wrangler output file")
    return entry


def site_url(entry: dict) -> str:
    targets = [t for t in (entry.get("targets") or []) if isinstance(t, str)]
    for t in targets:
        host, _, note = t.partition(" ")
        if note.startswith("(custom domain") and host and "/" not in host:
            return f"https://{host}"
    for t in targets:
        if t.startswith("https://") and " " not in t:
            return t.rstrip("/")
    raise ValueError(f"the deploy has no address to check (targets: {targets})")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    ap.add_argument("output_file", help="the file WRANGLER_OUTPUT_FILE_PATH pointed at")
    ap.add_argument("--field", help="print this field of the deploy entry instead (e.g. version_id)")
    args = ap.parse_args(argv)
    try:
        with open(args.output_file, encoding="utf-8") as f:
            entry = deploy_entry(f.read())
        if args.field:
            value = entry.get(args.field)
            if not value:
                raise ValueError(f"the deploy entry has no {args.field}")
            print(value)
        else:
            print(site_url(entry))
    except (OSError, ValueError) as exc:
        print(f"site_url: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

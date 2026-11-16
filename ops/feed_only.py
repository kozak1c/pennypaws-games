"""Decides from a diff whether a change is a feed-only update, the kind that may go live without the
owner's merge (PAWS-028).

    python3 ops/feed_only.py --base <commit> --head <commit> --into staging|main

A change is feed-only when all of these hold:

- the only file it changes is src/data/feed.json;
- both copies of the feed are JSON objects with the same top-level keys and the same schema_version,
  and every top-level value other than the product lists is unchanged;
- every product list holds the same ids before and after, so no product appears or leaves;
- no product changes its status (a game going from "coming soon" to out, say) or its page address.

So a price, a tagline, a picture or a rating changing on a product the site already shows is
feed-only; a new product, a removed one, a new page or any change outside the feed is not.

"Into staging" compares the head with its merge base (what the pull request adds). "Into main"
compares the two trees directly, because main only ever gets merge commits from staging and the
release puts the head's whole tree live.

The verdict never fails the run: it is printed, written to $GITHUB_OUTPUT as feed_only=true|false
and to $GITHUB_STEP_SUMMARY. Exit 2 means the decision itself could not be made (a git error).
The workflow runs the copy of this file from the base branch, so a pull request cannot change the
rule that judges it. pennypaws-kit (`paws release site`) makes the same decision on its own before
it merges anything; the two must agree.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

FEED = "src/data/feed.json"
COLLECTIONS = ("games", "printables", "books")
# A change to one of these on an existing product is not feed-only.
GUARDED = ("status", "page")


def git(*args: str) -> str:
    done = subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8")
    if done.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {done.stderr.strip()}")
    return done.stdout


def changed_files(base: str, head: str, into: str) -> list[str]:
    spec = f"{base}...{head}" if into == "staging" else f"{base}..{head}"
    return [line for line in git("diff", "--no-renames", "--name-only", spec).splitlines() if line]


def feed_at(commit: str) -> str | None:
    done = subprocess.run(["git", "show", f"{commit}:{FEED}"], capture_output=True, text=True, encoding="utf-8")
    return done.stdout if done.returncode == 0 else None


def decide(files: list[str], old_text: str | None, new_text: str | None) -> tuple[bool, list[str]]:
    """(feed_only, reasons it is not). Reasons is empty exactly when feed_only is true."""
    if not files:
        return False, ["nothing changes"]
    others = [f for f in files if f != FEED]
    if others:
        shown = ", ".join(others[:10]) + (f" and {len(others) - 10} more" if len(others) > 10 else "")
        return False, [f"files other than {FEED} change: {shown}"]
    try:
        old, new = json.loads(old_text or ""), json.loads(new_text or "")
    except json.JSONDecodeError:
        return False, ["a copy of the feed is missing or is not JSON"]
    if not isinstance(old, dict) or not isinstance(new, dict):
        return False, ["a copy of the feed is not a JSON object"]
    reasons: list[str] = []
    if old.keys() != new.keys():
        reasons.append("the feed's top-level keys change")
    if old.get("schema_version") != new.get("schema_version"):
        reasons.append("the feed's schema version changes")
    for key in sorted((old.keys() & new.keys()) - set(COLLECTIONS) - {"schema_version"}):
        if old[key] != new[key]:
            reasons.append(f"the feed's {key} changes")
    for collection in COLLECTIONS:
        try:
            before = {row["id"]: row for row in old.get(collection, [])}
            after = {row["id"]: row for row in new.get(collection, [])}
        except (TypeError, KeyError):
            reasons.append(f"{collection} is not a list of products with ids")
            continue
        for pid in sorted(after.keys() - before.keys()):
            reasons.append(f"{collection}/{pid} appears for the first time")
        for pid in sorted(before.keys() - after.keys()):
            reasons.append(f"{collection}/{pid} leaves the site")
        for pid in sorted(after.keys() & before.keys()):
            for field in GUARDED:
                if before[pid].get(field) != after[pid].get(field):
                    reasons.append(f"{collection}/{pid} changes its {field}")
    return not reasons, reasons


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", required=True)
    ap.add_argument("--into", required=True, choices=("staging", "main"))
    args = ap.parse_args(argv)
    try:
        files = changed_files(args.base, args.head, args.into)
        merge_base = git("merge-base", args.base, args.head).strip() if args.into == "staging" else args.base
    except RuntimeError as e:
        print(f"::error::{e}", file=sys.stderr)
        return 2
    feed_only, reasons = decide(files, feed_at(merge_base), feed_at(args.head))
    if feed_only:
        verdict = "Feed-only update: only the product facts of products already on the site change."
    else:
        verdict = "Not a feed-only update, so it waits for the owner's merge:\n" + "\n".join(f"- {r}" for r in reasons)
    print(verdict)
    if out := os.environ.get("GITHUB_OUTPUT"):
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"feed_only={'true' if feed_only else 'false'}\n")
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"### feed-only\n\n{verdict}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

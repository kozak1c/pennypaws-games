"""Keep one issue open while the live site fails its health check (the watchdog workflow).

    python ops/watchdog_issue.py <true|false> <report.md> <run address>

  check fails, no issue open        open "[watchdog] pennypawsgames.com is failing its health check"
  check fails, issue open           add a comment, at most one every QUIET_HOURS
  check passes, issue open          comment and close it
  check passes, no issue            nothing

Only an issue the workflow itself opened counts: this repository is public, and an issue with
the same title from anyone else must not be able to silence or close the alert. It talks to
GitHub through the `gh` command, which reads GH_TOKEN. Standard library only.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

TITLE = "[watchdog] pennypawsgames.com is failing its health check"
QUIET_HOURS = 6
BOT_LOGINS = {"app/github-actions", "github-actions", "github-actions[bot]"}


def gh(args: list[str]) -> str:
    done = subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")
    if done.returncode:
        raise SystemExit(f"gh {' '.join(args[:2])} failed: {done.stderr.strip()[:300]}")
    return done.stdout


def open_alert(issues: list[dict]) -> dict | None:
    """The workflow's own open alert, oldest first, or None."""
    own = [i for i in issues
           if i.get("title") == TITLE and (i.get("author") or {}).get("login") in BOT_LOGINS]
    return min(own, key=lambda i: i["number"]) if own else None


def decide(ok: bool, alert: dict | None, now: datetime) -> str:
    """One of: none, create, comment, close."""
    if ok:
        return "close" if alert else "none"
    if alert is None:
        return "create"
    updated = datetime.fromisoformat(alert["updatedAt"].replace("Z", "+00:00"))
    return "comment" if now - updated >= timedelta(hours=QUIET_HOURS) else "none"


def body(report: str, run: str, now: datetime) -> str:
    when = now.strftime("%Y-%m-%d %H:%M UTC")
    return (f"The health check failed twice, a minute apart, at {when}.\n\n{report.strip()}\n\n"
            f"Run: {run}\n\nWhat to do: docs/runbook.md, \"Alerts\". This issue closes itself "
            "when the check passes again.\n")


def main(argv: list[str], run=gh, now: datetime | None = None) -> int:
    if len(argv) != 3 or argv[0] not in ("true", "false"):
        print(__doc__)
        return 2
    ok, report_file, run_url = argv[0] == "true", Path(argv[1]), argv[2]
    now = now or datetime.now(timezone.utc)
    report = report_file.read_text(encoding="utf-8") if report_file.exists() else "(no report was written)"
    listed = json.loads(run(["issue", "list", "--state", "open", "--limit", "200",
                             "--json", "number,title,updatedAt,author"]))
    alert = open_alert(listed)
    action = decide(ok, alert, now)
    if action == "create":
        run(["issue", "create", "--title", TITLE, "--body", body(report, run_url, now)])
    elif action == "comment":
        run(["issue", "comment", str(alert["number"]), "--body", "Still failing.\n\n" + body(report, run_url, now)])
    elif action == "close":
        when = now.strftime("%Y-%m-%d %H:%M UTC")
        run(["issue", "close", str(alert["number"]), "--comment",
             f"The health check passes again as of {when}.\n\nRun: {run_url}\n"])
    print(f"watchdog: check {'passed' if ok else 'failed'}; issue action: {action}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

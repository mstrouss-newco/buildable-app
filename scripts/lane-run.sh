#!/bin/bash
# scripts/lane-run.sh — bring one lane up and hand over to the runner.
#
# Used by both the double-click launcher and the background agents, so the setup
# steps (make the lane's folder, clear stale git locks, park stray edits, pull)
# only exist in one place.
#
#   lane-run.sh <base folder> <lane number>
#
# Lane 1 works in <base>/buildable-app. Lanes 2+ get their own clone at
# <base>/buildable-laneN, made on first use. Separate folders are the whole point:
# every session runs `git add` before it commits, so two lanes sharing a folder
# would commit each other's half-finished work.
set -u
BASE="${1:?base folder required}"
LANE="${2:-1}"
MAIN="$BASE/buildable-app"

if [ "$LANE" = "1" ]; then LANEDIR="$MAIN"; else LANEDIR="$BASE/buildable-lane$LANE"; fi

# Already running in this folder? Do not start a second one on top of it.
LOCK="$LANEDIR/.autopilot-lane.lock"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "Lane $LANE is already running (pid $(cat "$LOCK"))."
  exit 3
fi

if [ ! -d "$LANEDIR/.git" ]; then
  echo "Setting up lane $LANE. This happens once."
  ORIGIN=$(git -C "$MAIN" remote get-url origin 2>/dev/null | sed -E 's#https://[^@]*@#https://#')
  git clone --quiet "$MAIN" "$LANEDIR" || { echo "Could not create $LANEDIR"; exit 1; }
  git -C "$LANEDIR" remote set-url origin "$ORIGIN"
fi

cd "$LANEDIR" || { echo "Could not open $LANEDIR"; exit 1; }
echo $$ > .autopilot-lane.lock
trap 'rm -f "$LANEDIR/.autopilot-lane.lock"' EXIT INT TERM

# A git that crashed leaves empty .lock files behind and every later git command
# then refuses with "another git process seems to be running".
LOCKS=$(find .git -name "*.lock" 2>/dev/null)
if [ -n "$LOCKS" ]; then
  echo "Clearing leftover git lock files..."
  echo "$LOCKS" | while read -r f; do rm -f "$f"; done
fi

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "Parking uncommitted changes (recoverable with 'git stash list'):"
  git status --short | sed 's/^/    /'
  git stash push -u -m "parked by the roadmap runner on $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1
fi

echo "Getting the latest code..."
git checkout main >/dev/null 2>&1
# --rebase, not --ff-only: a session that committed but could not push leaves local
# commits behind, and --ff-only just refuses. This replays them on top instead.
PULL_OUT=$(git pull --rebase --autostash 2>&1)
PULL_RC=$?
if [ $PULL_RC -ne 0 ]; then git rebase --abort >/dev/null 2>&1; fi
if [ $PULL_RC -ne 0 ]; then
  echo "Could not download the latest code:"
  echo "$PULL_OUT"
  exit 1
fi
echo "$PULL_OUT"

exec node scripts/autopilot.mjs --watch --lane "$LANE"

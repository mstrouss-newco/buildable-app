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

# One place decides how a folder gets onto the latest main. See repo-sync.sh for
# the three things that go wrong and why local commits are pushed or parked rather
# than rebased.
bash "$LANEDIR/scripts/repo-sync.sh" "$LANEDIR" || exit 1

exec node scripts/autopilot.mjs --watch --lane "$LANE"

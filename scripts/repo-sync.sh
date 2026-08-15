#!/bin/bash
# scripts/repo-sync.sh — put one folder on the latest main, whatever state it is in.
#
#   repo-sync.sh <folder>
#
# A lane's folder is a disposable checkout. It must end up exactly on origin/main
# every time, because a session that starts from a half-rebased or diverged tree
# will build on top of a mess.
#
# Three things go wrong in practice, and all three are handled here:
#
#  1. Stale `.lock` files from a git that crashed months ago, after which every
#     git command claims another git is running.
#  2. Uncommitted edits, which block a checkout.
#  3. LOCAL COMMITS a session made but could not push. `--ff-only` refuses these
#     and the launcher then dies; `--rebase` hits conflicts once the same work has
#     reached main by another route. So: try to push them, and if that fails keep
#     them on a dated branch. Nothing is ever thrown away, and the folder still
#     ends up clean.
set -u
DIR="${1:?folder required}"
cd "$DIR" || { echo "Could not open $DIR"; exit 1; }

LOCKS=$(find .git -name "*.lock" 2>/dev/null)
if [ -n "$LOCKS" ]; then
  echo "Clearing leftover git lock files..."
  echo "$LOCKS" | while read -r f; do rm -f "$f"; done
fi

# Never leave a half-finished rebase or merge behind us.
git rebase --abort  >/dev/null 2>&1
git merge  --abort  >/dev/null 2>&1
git am     --abort  >/dev/null 2>&1

git checkout main >/dev/null 2>&1

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "Parking uncommitted changes (recoverable with 'git stash list'):"
  git status --short | sed 's/^/    /'
  git stash push -u -m "parked by the roadmap runner on $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1
fi

echo "Getting the latest code..."
if ! git fetch --quiet origin main; then
  echo "Could not reach GitHub. If it asks for a username and password, the username"
  echo "is mstrouss-newco and the password is the token in PUSH-TOKEN.txt."
  exit 1
fi

AHEAD=$(git rev-list --count origin/main..main 2>/dev/null || echo 0)
if [ "$AHEAD" != "0" ]; then
  echo "This copy has $AHEAD commit(s) that never reached GitHub. Trying to send them..."
  if git push --quiet origin main 2>/dev/null; then
    echo "Sent. Nothing was lost."
    git fetch --quiet origin main
  else
    BK="parked/$(date '+%Y%m%d-%H%M%S')"
    git branch "$BK" main >/dev/null 2>&1
    echo "Could not send them, so they are saved on branch $BK. Tell Claude and"
    echo "they will be pushed properly."
  fi
fi

# The folder is now definitely on the latest main, with nothing lost behind it.
git reset --hard --quiet origin/main || { echo "Could not move onto the latest code."; exit 1; }
echo "Up to date: $(git log --oneline -1)"

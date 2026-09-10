#!/usr/bin/env bash
#
# Rebuilds both static surfaces and publishes them to /var/www/cordon.
#
# Run this on the machine that serves the site. The two bundles share one
# origin — the site at the root, the console under /console/ — which is why
# they are published together and by one command: publishing one of them by
# hand is how they end up built from different commits, and the symptom is a
# nav link that 404s on a page nobody opened that day.
#
# It refuses rather than publishing something reassuring, in the ways this
# layout can actually bite:
#
#   - a destination that is not the site (an empty directory publishes fine)
#   - a console bundle built without base /console/, which loads nothing
#   - a site bundle whose index.html is missing
#
# It copies and never deletes at the root. /var/www/cordon also holds
# console/ and .well-known/; an `rsync --delete` there removes the console the
# judges are pointed at and breaks the certificate renewal in the same pass.
#
#   cordon-publish.sh              # rebuild and publish from ~/cordon
#   cordon-publish.sh --dry-run    # say what would change, touch nothing
#
set -euo pipefail

REPO=${CORDON_REPO:-$HOME/cordon}
WWW=${CORDON_WWW:-/var/www/cordon}
DRY=no
[ "${1:-}" = "--dry-run" ] && DRY=yes

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
refuse() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) refusing: $*" >&2; exit 1; }

[ -d "$REPO/packages/site" ] || refuse "$REPO is not the repository (no packages/site)"
[ -d "$REPO/packages/console" ] || refuse "$REPO is not the repository (no packages/console)"

# The destination is checked for what the site *is*, not for existing. A typo
# in CORDON_WWW names a directory that can be created, written into and served
# by nginx, and the failure looks like a deploy that worked.
[ -d "$WWW" ] || refuse "$WWW does not exist; create it and point nginx at it first"

cd "$REPO"

# The record pages resolve the ids the chain writes off the meter, and the
# meter is served from this same origin at /api. Unset, the site falls back to
# the preview tree and says so — which is the honest default for a laptop and
# the wrong one for the host whose name is written into every record.
export VITE_METER_URL="${CORDON_METER_URL:-/api}"

log "building site with meter at $VITE_METER_URL"
npm run build --prefix packages/site
log "building console"
npm run build --prefix packages/console

SITE="$REPO/packages/site/dist"
CONSOLE="$REPO/packages/console/dist"

[ -f "$SITE/index.html" ] || refuse "$SITE/index.html is missing; the site did not build"
[ -f "$CONSOLE/index.html" ] || refuse "$CONSOLE/index.html is missing; the console did not build"

# The one thing about this layout that fails silently. Built without
# `base: "/console/"` the console emits /assets/… , which resolves against the
# origin root, collides with the site's own bundle names and serves a blank
# page. Checking the built HTML catches it whatever the config says.
grep -q '/console/assets/' "$CONSOLE/index.html" ||
  refuse "the console bundle does not reference /console/assets/ — it was built without base /console/"

RSYNC=(rsync -a --human-readable)
[ "$DRY" = yes ] && RSYNC+=(--dry-run --itemize-changes)

# Root: copy, never delete. console/ and .well-known/ live here too.
log "publishing site to $WWW"
"${RSYNC[@]}" --exclude console/ --exclude .well-known/ "$SITE/" "$WWW/"

# The console's directory is exclusively its own build, so stale hashed assets
# there can go.
log "publishing console to $WWW/console"
mkdir -p "$WWW/console"
"${RSYNC[@]}" --delete "$CONSOLE/" "$WWW/console/"

if [ "$DRY" = yes ]; then
  log "dry run, nothing written"
  exit 0
fi

log "published $(git -C "$REPO" rev-parse --short HEAD)"
log "  https://getcordon.xyz/"
log "  https://getcordon.xyz/console/"

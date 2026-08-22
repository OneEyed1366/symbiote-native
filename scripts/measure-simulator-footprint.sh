#!/usr/bin/env bash
# Reports the memory footprint of an app running on the booted iOS Simulator, sampled over time,
# plus the per-category breakdown of where that memory actually sits.
#
#   scripts/measure-simulator-footprint.sh [ProcessName] [samples] [intervalSeconds]
#   scripts/measure-simulator-footprint.sh Canary 8 5
#
# Simulator apps are ordinary macOS host processes, so `footprint` reads them directly — no
# Xcode, no Instruments, no attached debugger. That matters: a debugger session inflates the
# number, which is exactly the distortion we are trying to avoid when comparing two adapters.
#
# `footprint` reports PHYSICAL FOOTPRINT — the metric Xcode's memory gauge shows and the one iOS
# enforces jetsam limits against. Deliberately NOT `ps` RSS, which double-counts shared pages.
#
# Two things to read off the output:
#   - Does the number climb and PLATEAU (a working set filling — normal), or climb without
#     settling (a leak)?
#   - WHERE does it sit? The category table separates JS (Hermes shows up under MALLOC regions)
#     from CoreAnimation / IOSurface / image data, i.e. native views and textures. A delta
#     between two adapters that lives in CoreAnimation is a native-view difference, not a JS one,
#     and no amount of JS heap-snapshotting will explain it.

set -euo pipefail

PROCESS="${1:-Canary}"
SAMPLES="${2:-6}"
INTERVAL="${3:-5}"

PID="$(pgrep -x "$PROCESS" | head -1 || true)"
if [ -z "$PID" ]; then
  echo "no running process named '$PROCESS' — launch the app on the simulator first" >&2
  exit 1
fi

echo "process $PROCESS  pid $PID   ${SAMPLES} samples every ${INTERVAL}s"
echo
printf '%10s   %s\n' "time" "footprint"

for ((i = 1; i <= SAMPLES; i++)); do
  VALUE="$(footprint -p "$PID" 2>/dev/null | sed -n 's/.*Footprint: \([0-9.]* [KMG]B\).*/\1/p' | head -1)"
  printf '%10s   %s\n' "$(date +%H:%M:%S)" "${VALUE:-<no reading>}"
  [ "$i" -lt "$SAMPLES" ] && sleep "$INTERVAL"
done

echo
echo "--- where it sits (top categories, final sample)"
footprint -p "$PID" 2>/dev/null | sed -n '/Dirty/,$p' | head -14

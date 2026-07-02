#!/usr/bin/env bash
# Angular needs a pre-Metro AOT compile (ngc), kept in sync via `ngc --watch`
# while developing (see the angular-adapter skill, §4). Metro itself must stay
# the FOREGROUND process — it reads raw keypresses (r/j/d/...) straight off
# stdin, and any wrapper that pipes stdin through itself (concurrently,
# npm-run-all, ...) breaks that raw-mode read. So ngc runs in the background,
# started from a plain shell, never a stdin-owning process manager.
set -e
cd "$(dirname "$0")/.."

pnpm ng:build

pnpm ng:watch &
ngc_pid=$!
trap 'kill "$ngc_pid" 2>/dev/null' EXIT

react-native start "$@"

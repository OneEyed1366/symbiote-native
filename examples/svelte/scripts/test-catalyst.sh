#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export FORCE_BUNDLING=1
export EXTRA_PACKAGER_ARGS="--max-workers 1"

results="${SYMBIOTE_CATALYST_RESULTS:-$PWD/ios/build/catalyst-results}"
mkdir -p "$results"

bundle exec pod install --project-directory=ios 2>&1 | tee "$results/pods.log"
# Ad hoc XCTest hosts need to load their separately signed test bundle.
xcodebuild -quiet test \
  -workspace ios/Canary.xcworkspace \
  -scheme CanaryCatalyst \
  -configuration Release \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath ios/build/catalyst \
  -resultBundlePath "$results/Canary-$(date +%Y%m%dT%H%M%S)-$$.xcresult" \
  -jobs 1 \
  -parallel-testing-enabled NO \
  ONLY_ACTIVE_ARCH=YES \
  ENABLE_HARDENED_RUNTIME=NO \
  CODE_SIGN_IDENTITY=- 2>&1 | tee "$results/xcodebuild.log"

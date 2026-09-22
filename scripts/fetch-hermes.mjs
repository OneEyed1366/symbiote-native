// Puts a hermes-engine destroot at `.hermes/destroot` so the C++ tester can be hosted on Hermes
// without a `pod install`.
//
// The tester links `hermesvm.framework` and compiles against Hermes's own `jsi/` headers, and both
// arrive in the `hermes-engine` pod — which is a CocoaPods artefact, not a tracked dependency. A
// developer with a built example already has one and needs nothing here; CI has no Pods tree at all,
// so without this step the CMake configure fails outright (deliberately: falling back to
// JavaScriptCore would silently measure the wrong engine).
//
// The pod is `Pre-built`, so what CocoaPods does is fetch one Maven tarball and unpack it. That is
// the whole of this script. Idempotent: an existing destroot is left alone, which is what makes it
// safe to run unconditionally in front of a cached directory.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTROOT = join(REPO_ROOT, '.hermes', 'destroot');
const MARKER = join(DESTROOT, 'Library/Frameworks/macosx/hermesvm.framework');

// `release` rather than `debug`, so a timing taken against this framework is taken against the VM a
// shipped app runs. The assertions in the debug build are Hermes's own, not ours, and nothing in
// this repo is trying to catch a bug inside the engine.
const BUILD_TYPE = process.env.SYMBIOTE_HERMES_BUILD_TYPE ?? 'release';

/**
 * The version CocoaPods would resolve, read from the same file its podspec reads
 * (`sdks/hermes-engine/version.properties`) rather than from the Podfile.lock of one example — an
 * example can be stale, and the lockfile is a consequence of this number rather than a source of it.
 */
async function hermesVersion() {
  const require = createRequire(import.meta.url);
  const reactNative = dirname(require.resolve('react-native/package.json'));
  const text = await readFile(
    join(reactNative, 'sdks/hermes-engine/version.properties'),
    'utf8',
  );
  const key =
    process.env.RCT_HERMES_V1_ENABLED === '0'
      ? 'HERMES_VERSION_NAME'
      : 'HERMES_V1_VERSION_NAME';
  const match = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (match === null) {
    throw new Error(`${key} is missing from react-native's version.properties`);
  }
  return match[1].trim();
}

function tarballUrl(version) {
  // Mirrors `release_tarball_url` in react-native/sdks/hermes-engine/hermes-utils.rb, including its
  // ENTERPRISE_REPOSITORY escape hatch, so a mirror configured for CocoaPods works here too.
  const base =
    process.env.ENTERPRISE_REPOSITORY || 'https://repo1.maven.org/maven2';
  return `${base}/com/facebook/hermes/hermes-ios/${version}/hermes-ios-${version}-hermes-ios-${BUILD_TYPE}.tar.gz`;
}

async function main() {
  if (existsSync(MARKER)) {
    console.log(`hermes destroot already present: ${DESTROOT}`);
    return;
  }

  const version = await hermesVersion();
  const url = tarballUrl(version);
  console.log(`fetching hermes ${version} (${BUILD_TYPE})\n  ${url}`);

  const staging = join(REPO_ROOT, '.hermes');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  // Piped rather than written to disk first: the archive is ~27 MB and nothing needs it afterwards.
  // `--fail` so an HTTP error is an exit code instead of an HTML page handed to tar.
  execFileSync(
    'bash',
    ['-c', `curl -fsSL "${url}" | tar -xz -C "${staging}"`],
    { stdio: 'inherit' },
  );

  if (!existsSync(MARKER)) {
    throw new Error(
      `the tarball unpacked but ${MARKER} is not there — the artifact layout changed`,
    );
  }
  console.log(`hermes destroot ready: ${DESTROOT}`);
}

await main();

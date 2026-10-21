import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { normalizeCatalystFrameworks } from '../examples/svelte/scripts/normalize-catalyst-frameworks.mjs';

test('restores flattened framework links without changing binaries, and is repeatable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'catalyst-frameworks-'));
  try {
    const frameworks = [];
    for (const [pod, name] of [
      ['React-Core-prebuilt', 'React'],
      ['ReactNativeDependencies', 'ReactNativeDependencies'],
    ]) {
      const framework = join(
        directory,
        'XCFrameworkIntermediates',
        pod,
        `${name}.framework`,
      );
      const version = join(framework, 'Versions/A');
      mkdirSync(join(version, 'Resources'), { recursive: true });
      writeFileSync(join(version, name), `binary: ${name}`);
      writeFileSync(join(version, 'Resources/Info.plist'), 'metadata');
      cpSync(version, join(framework, 'Versions/Current'), { recursive: true });
      cpSync(join(version, name), join(framework, name));
      cpSync(join(version, 'Resources'), join(framework, 'Resources'), {
        recursive: true,
      });
      mkdirSync(join(framework, `${name}_privacy.bundle`));
      writeFileSync(
        join(framework, `${name}_privacy.bundle/PrivacyInfo.xcprivacy`),
        'privacy',
      );
      frameworks.push([framework, name]);
    }
    const entry = join(directory, 'normalize.mjs');
    symlinkSync(
      fileURLToPath(
        new URL(
          '../examples/svelte/scripts/normalize-catalyst-frameworks.mjs',
          import.meta.url,
        ),
      ),
      entry,
    );
    execFileSync(process.execPath, [entry], {
      env: { ...process.env, BUILT_PRODUCTS_DIR: directory },
    });
    assert.ok(
      lstatSync(join(frameworks[0][0], frameworks[0][1])).isSymbolicLink(),
    );
    normalizeCatalystFrameworks(directory);
    for (const [framework, name] of frameworks) {
      assert.equal(
        existsSync(join(framework, `${name}_privacy.bundle`)),
        false,
      );
      assert.equal(
        readFileSync(
          join(
            framework,
            `Resources/${name}_privacy.bundle/PrivacyInfo.xcprivacy`,
          ),
          'utf8',
        ),
        'privacy',
      );
      for (const path of ['Versions/Current', name, 'Resources']) {
        assert.ok(lstatSync(join(framework, path)).isSymbolicLink());
      }
      assert.equal(
        readFileSync(join(framework, name), 'utf8'),
        `binary: ${name}`,
      );
      assert.equal(
        readFileSync(join(framework, 'Resources/Info.plist'), 'utf8'),
        'metadata',
      );
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('rejects missing framework layouts before removing anything', () => {
  const directory = mkdtempSync(join(tmpdir(), 'catalyst-frameworks-'));
  try {
    const sentinel = join(directory, 'keep');
    writeFileSync(sentinel, 'untouched');
    assert.throws(
      () => normalizeCatalystFrameworks(directory),
      /Expected a versioned/,
    );
    assert.equal(readFileSync(sentinel, 'utf8'), 'untouched');
    assert.throws(() => normalizeCatalystFrameworks(), /BUILT_PRODUCTS_DIR/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

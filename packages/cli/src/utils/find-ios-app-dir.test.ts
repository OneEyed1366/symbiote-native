import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findIosAppDir } from './find-ios-app-dir.js';

describe('findIosAppDir', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeRoot(): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-ios-dir-'),
    );
    tmpDirs.push(root);
    return root;
  }

  it('finds the real app directory, whatever it is named', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'ios', 'SomeRealAppName'), {
      recursive: true,
    });
    expect(findIosAppDir(root)).toBe(path.join(root, 'ios', 'SomeRealAppName'));
  });

  // CocoaPods' own directory and loose files (.xcode.env) sit alongside the app's directory
  // under ios/ — neither is the app's own native source directory.
  it('ignores the Pods/ directory and non-directory entries', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'ios', 'Pods'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ios', '.xcode.env'), '');
    fs.mkdirSync(path.join(root, 'ios', 'RealApp'), { recursive: true });
    expect(findIosAppDir(root)).toBe(path.join(root, 'ios', 'RealApp'));
  });

  it('returns undefined when there is no ios/ directory at all', () => {
    const root = makeRoot();
    expect(findIosAppDir(root)).toBe(undefined);
  });
});

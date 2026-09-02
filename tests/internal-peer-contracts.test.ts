// Internal peers used to carry manually copied, unbounded minimums such as `>=0.1.7`. Those ranges
// stayed unchanged while adapters began importing newer engine exports, so npm accepted package
// combinations that could not bundle. `workspace:^` makes the source contract self-updating:
// `pnpm pack` rewrites it to a bounded caret range for the peer's current workspace version.
//
// This test guards the source half of that contract. The packed-consumer matrix guards the emitted
// tarball half, where `workspace:^` must have become an ordinary semver range.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE_GROUPS = ['core', 'adapters', 'packages'] as const;
const INTERNAL_PREFIX = '@symbiote-native/';

interface IManifest {
  readonly name?: string;
  readonly version?: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface IWorkspacePackage {
  readonly file: string;
  readonly manifest: IManifest;
}

function readWorkspacePackages(): Map<string, IWorkspacePackage> {
  const found = new Map<string, IWorkspacePackage>();
  for (const group of PACKAGE_GROUPS) {
    const groupDir = path.join(REPO_ROOT, group);
    for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(groupDir, entry.name, 'package.json');
      if (!fs.existsSync(file)) continue;
      const manifest: IManifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (manifest.name?.startsWith(INTERNAL_PREFIX) !== true) continue;
      found.set(manifest.name, {
        file: path.relative(REPO_ROOT, file),
        manifest,
      });
    }
  }
  return found;
}

const WORKSPACE_PACKAGES = readWorkspacePackages();
const INTERNAL_PEERS = [...WORKSPACE_PACKAGES.values()].flatMap(pkg =>
  Object.entries(pkg.manifest.peerDependencies ?? {})
    .filter(([peerName]) => peerName.startsWith(INTERNAL_PREFIX))
    .map(([peerName, range]) => ({ pkg, peerName, range })),
);

describe('internal peer contracts', () => {
  it('finds the internal peer graph to check', () => {
    // A package-layout or parser regression must not turn the contract check into zero cases.
    expect(WORKSPACE_PACKAGES.size).toBeGreaterThan(30);
    expect(INTERNAL_PEERS.length).toBeGreaterThan(100);
  });

  it('derives every internal peer range from the current workspace version', () => {
    const problems: string[] = [];
    for (const { pkg, peerName, range } of INTERNAL_PEERS) {
      const peer = WORKSPACE_PACKAGES.get(peerName);
      if (peer === undefined) {
        problems.push(`${pkg.file}: ${peerName} is not a workspace package`);
        continue;
      }
      if (range !== 'workspace:^') {
        problems.push(
          `${pkg.file}: ${peerName} must be workspace:^, received ${JSON.stringify(range)}`,
        );
      }
      const devRange = pkg.manifest.devDependencies?.[peerName];
      if (devRange !== 'workspace:*') {
        problems.push(
          `${pkg.file}: ${peerName} also needs devDependencies workspace:* for local resolution, ` +
            `received ${JSON.stringify(devRange)}`,
        );
      }
      if (typeof peer.manifest.version !== 'string') {
        problems.push(
          `${peer.file}: ${peerName} has no version for pnpm pack to resolve`,
        );
      }
    }
    expect(problems.sort().join('\n')).toBe('');
  });
});

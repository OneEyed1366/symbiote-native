// What the local registry last received per package, so a sync sends only what changed
// A stamp is the `npm pack --dry-run` integrity, which is stable for identical file contents

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The newest modification time under a package, or 0 for an empty folder
// `skipped` names folders left out at any depth, `node_modules` by default
export function newestMtimeMs(dir, skipped = ['node_modules']) {
  return readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
    if (skipped.includes(entry.name)) return newest;
    const path = join(dir, entry.name);
    const mtime = entry.isDirectory()
      ? newestMtimeMs(path, skipped)
      : statSync(path).mtimeMs;
    return Math.max(newest, mtime);
  }, 0);
}

export function readStamps(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

export function writeStamps(path, stamps) {
  writeFileSync(path, `${JSON.stringify(stamps, null, 2)}\n`);
}

// A package is unchanged when its version and integrity both match the stamp and the registry
// still holds that version, since a wiped registry volume leaves stamps that lie
export function isUnchanged(stamp, current, isInRegistry) {
  return (
    stamp !== undefined &&
    stamp.version === current.version &&
    stamp.integrity === current.integrity &&
    isInRegistry
  );
}

// A package no file of which was written since it was stamped needs no pack to know it is the same
export function isUntouched(stamp, version, newestMtime) {
  return (
    stamp !== undefined &&
    stamp.version === version &&
    typeof stamp.at === 'number' &&
    newestMtime <= stamp.at
  );
}

// The changed packages plus every package that depends on one of them, directly or through another
// `dependenciesByName` maps a package name to the names it depends on
export function withDependents(changedNames, dependenciesByName) {
  const closed = new Set(changedNames);
  let hasGrown = true;
  while (hasGrown) {
    const before = closed.size;
    Object.entries(dependenciesByName)
      .filter(([, names]) => names.some(name => closed.has(name)))
      .forEach(([name]) => closed.add(name));
    hasGrown = closed.size > before;
  }
  return [...closed];
}

// Stamped packages whose integrity differs from what an example last installed, or never recorded
export function movedSince(stamps, installed) {
  return Object.entries(stamps)
    .filter(([name, stamp]) => installed[name] !== stamp.integrity)
    .map(([name, stamp]) => ({ name, version: stamp.version }));
}

// The example packages a targeted install must replace: those the example declares and that moved
export function declaredAmong(manifest, changedNames) {
  const declared = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  return changedNames.filter(name => name in declared);
}

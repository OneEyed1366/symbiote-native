import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IFramework } from './types.js';

// Order matters: an Angular or Vue app's package.json also lists `react` transitively far
// less often than the reverse, but checking the more specific framework dependency first
// keeps this correct even if that ever stops holding.
const FRAMEWORK_BY_DEPENDENCY: ReadonlyArray<readonly [string, IFramework]> = [
  ['@angular/core', 'angular'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
  ['solid-js', 'solid'],
  ['react', 'react'],
];

export function detectFrameworkFromDependencies(
  dependencies: Readonly<Record<string, string>>,
): IFramework | undefined {
  const match = FRAMEWORK_BY_DEPENDENCY.find(
    ([dependencyName]) => dependencyName in dependencies,
  );
  return match?.[1];
}

const SYMBIOTE_ADAPTER_BY_DEPENDENCY: ReadonlyArray<
  readonly [string, IFramework]
> = [
  ['@symbiote-native/angular', 'angular'],
  ['@symbiote-native/vue', 'vue'],
  ['@symbiote-native/svelte', 'svelte'],
  ['@symbiote-native/solid', 'solid'],
  ['@symbiote-native/react', 'react'],
];

// Unlike detectFrameworkFromDependencies (which matches the underlying framework itself, present
// in ANY RN app), this matches specifically on OUR scoped adapter package — the signal `add`'s
// eligibility guard needs: "is this a @symbiote-native/* app" is a different question from "does
// this app use React".
export function detectSymbioteFrameworkFromDependencies(
  dependencies: Readonly<Record<string, string>>,
): IFramework | undefined {
  const match = SYMBIOTE_ADAPTER_BY_DEPENDENCY.find(
    ([dependencyName]) => dependencyName in dependencies,
  );
  return match?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
}

export function readCwdDependencies(
  cwd = process.cwd(),
): Record<string, string> {
  try {
    const raw = readFileSync(join(cwd, 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return {
      ...toStringRecord(parsed.dependencies),
      ...toStringRecord(parsed.devDependencies),
    };
  } catch {
    return {};
  }
}

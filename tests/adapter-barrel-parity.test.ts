// Every adapter re-exports ~100 framework-agnostic names verbatim from @symbiote-native/engine
// and @symbiote-native/components. Nothing enforced that the four lists agreed, so they drifted:
// PanResponder was missing from the Svelte barrel until 2026-08-12, and this test found 22 more.
// A missing re-export is not a type error, so tsc never sees it; it surfaces only when an app
// imports the name and its framework's package turns out not to have it.
//
// Reads the barrels as SOURCE rather than importing them: most drifting names are types, so
// `Object.keys(await import(...))` would see none of them.
//
// KNOWN_GAPS is compared for EQUALITY, not containment. Adding a shared name to one barrel and
// forgetting the rest fails with the adapters named; closing a gap without deleting its entry
// fails too, so the list cannot rot into an allowlist that quietly permits new drift.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
// All five adapters are in scope. 'solid' was held out while that adapter sat at L1 (static paint),
// when its barrel carried only mount/unmount/findNodeHandle and would have reported every shared
// name as drift; it joined at L4, and what it still genuinely lacks is named in KNOWN_GAPS.
const ADAPTERS = ['react', 'vue', 'angular', 'svelte', 'solid'] as const;
const SHARED_BARRELS = [
  'core/engine/src/index.ts',
  'core/components/src/index.ts',
];

type IAdapter = (typeof ADAPTERS)[number];

// A shared name an adapter deliberately does NOT re-export. Only a genuine per-adapter difference
// belongs here; the 22 gaps this test found on its first run were all closed instead.
const KNOWN_GAPS: Readonly<Record<string, readonly IAdapter[]>> = {
  // Matches a shared name without being a passthrough: React and Vue DECLARE their own
  // `ITextInputProps` (the agnostic base plus their `className`), so this is the per-adapter half
  // of <prop_types_split_agnostic_vs_per_adapter>. Angular takes props as @Input()s and exposes
  // no per-component prop type at all, its barrel carrying no IScrollViewProps/IModalProps either.
  ITextInputProps: ['angular'],
};

// Candidate file names for a relative `export *` target, in resolution order.
const MODULE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

// Resolves the target of an `export *` to a file this scan can read. Only a relative specifier has
// one; a package specifier is refused rather than skipped, since skipping would under-report the
// barrel and invent gaps for names it does export.
function starTarget(node: ts.ExportDeclaration, fromPath: string): string {
  const specifier = node.moduleSpecifier;
  if (
    specifier === undefined ||
    !ts.isStringLiteral(specifier) ||
    !specifier.text.startsWith('.')
  ) {
    throw new Error(
      `${fromPath}: \`export *\` from a package is not supported by the parity scan`,
    );
  }
  const base = path.join(path.dirname(fromPath), specifier.text);
  const found = MODULE_SUFFIXES.map(suffix => `${base}${suffix}`).find(
    candidate => fs.existsSync(path.join(REPO_ROOT, candidate)),
  );
  if (found === undefined) {
    throw new Error(
      `${fromPath}: cannot resolve \`export * from '${specifier.text}'\``,
    );
  }
  return found;
}

function exportedNames(relativePath: string): Set<string> {
  const absolute = path.join(REPO_ROOT, relativePath);
  const source = ts.createSourceFile(
    absolute,
    fs.readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set<string>();
  source.forEachChild(node => {
    if (!ts.isExportDeclaration(node)) return;
    // `export * from './x'` hides names behind the file it names — Solid's barrel re-exports its
    // whole components module that way. Read through it rather than under-report the surface.
    if (node.exportClause === undefined) {
      for (const name of exportedNames(starTarget(node, relativePath)))
        names.add(name);
      return;
    }
    if (!ts.isNamedExports(node.exportClause)) return;
    for (const element of node.exportClause.elements)
      names.add(element.name.text);
  });
  return names;
}

const sharedNames = new Set(
  SHARED_BARRELS.flatMap(barrel => [...exportedNames(barrel)]),
);
const adapterNames = new Map<IAdapter, Set<string>>(
  ADAPTERS.map(adapter => [
    adapter,
    exportedNames(`adapters/${adapter}/src/index.ts`),
  ]),
);

function sortedKey(adapters: readonly IAdapter[]): string {
  return [...adapters].sort().join(', ');
}

// A shared name counts only once some adapter has decided to expose it; that decision is what the
// other three then owe.
function actualGaps(): Map<string, IAdapter[]> {
  const gaps = new Map<string, IAdapter[]>();
  for (const name of sharedNames) {
    const exporting = ADAPTERS.filter(adapter =>
      adapterNames.get(adapter)?.has(name),
    );
    if (exporting.length === 0 || exporting.length === ADAPTERS.length)
      continue;
    gaps.set(
      name,
      ADAPTERS.filter(adapter => !exporting.includes(adapter)),
    );
  }
  return gaps;
}

// No Negative group: this is a static consistency check over four barrel files, not code with a
// guard clause to reject bad input — every claim below is Positive ("the barrels currently agree
// with the declared contract"). An unagreed drift is reported as a test FAILURE (the mechanism
// this suite exists to provide), not asserted as an expected throw.
describe('adapter barrel parity', () => {
  // why: enforces <adapters_reach_full_feature_parity> (CLAUDE.md, P0) at the barrel-export level
  // — a shared engine/components name has to reach every adapter's public surface identically, or
  // an app on one framework silently loses an API another framework has. Equality (not
  // containment) against KNOWN_GAPS means closing a gap without deleting its entry fails too, so
  // the allowlist can't quietly widen to cover new drift the way a containment check would allow.
  it('exposes the shared surface identically, except for the recorded gaps', () => {
    const gaps = actualGaps();
    const problems: string[] = [];

    for (const [name, missing] of gaps) {
      const expected = KNOWN_GAPS[name];
      if (expected === undefined) {
        problems.push(
          `${name}: missing from ${missing.join(', ')} - re-export it there, ` +
            'or add it to KNOWN_GAPS with the reason',
        );
        continue;
      }
      if (sortedKey(missing) !== sortedKey(expected)) {
        problems.push(
          `${name}: KNOWN_GAPS says ${expected.join(', ')} but it is now missing from ` +
            `${missing.join(', ')} - update the entry`,
        );
      }
    }
    for (const name of Object.keys(KNOWN_GAPS)) {
      if (!gaps.has(name))
        problems.push(`${name}: gap is closed - delete its KNOWN_GAPS entry`);
    }

    // One newline-joined string, not an array: Vitest abbreviates a failing array to
    // `[ Array(n) ]`, which would hide the very names the reader needs.
    expect(problems.sort().join('\n')).toBe('');
  });

  // why: enforces <runtime_modules_layering> (CLAUDE.md) — these modules carry no visual and no
  // framework lifecycle, so unlike a component's prop surface there is never a legitimate
  // per-framework reason for one adapter to lag on one. Kept as a hardcoded name list rather than
  // reusing sharedNames/actualGaps above: these are re-exports of adapter-owned thin wrappers
  // (Keyboard-shaped, native-bridge modules per <runtime_modules_layering>), not names sourced
  // from the two SHARED_BARRELS, so they fall outside that mechanism entirely.
  it('keeps every adapter on the same imperative runtime modules', () => {
    // The engine-owned modules of <runtime_modules_layering>: no visual, no lifecycle, so there
    // is never a per-framework reason for one adapter to skip one.
    const RUNTIME_MODULES = [
      'Alert',
      'Share',
      'ActionSheetIOS',
      'Linking',
      'Vibration',
      'ToastAndroid',
      'Settings',
      'I18nManager',
      'Dimensions',
      'Appearance',
      'AppState',
      'Keyboard',
      'BackHandler',
      'PermissionsAndroid',
      'LayoutAnimation',
      'InteractionManager',
      'PanResponder',
      'Platform',
      'StyleSheet',
      'PixelRatio',
    ];
    for (const adapter of ADAPTERS) {
      const missing = RUNTIME_MODULES.filter(
        name => !adapterNames.get(adapter)?.has(name),
      );
      expect(
        missing,
        `@symbiote-native/${adapter} is missing runtime modules`,
      ).toEqual([]);
    }
  });
});

// A lowering transform may ROUTE. It may not carry BEHAVIOUR.
//
// This is the fragility meter for the whole lowering design, and it is mechanical rather than
// behavioural on purpose. The old model's defect was never that a transform was wrong — it was that
// a transform CARRIED the prop folds, the state-style split and the intrinsic choice, so a missed
// call site changed what the app committed, silently, on device only. Every one of those has since
// moved into the engine (`foldHostBag`, `routeProp`'s `isStyleCallback`, `resolveIntrinsicTag`).
//
// What keeps them there is not discipline. It is that a transform which imports no payload-changing
// module CANNOT change a payload — a structural property, checkable by reading the import list.
//
// THE DISTINCTION THAT MATTERS, and the test would be wrong without it: EMITTING an import into the
// output is delegating to the runtime and is fine. Svelte prints
// `import { resolveStateStyle } from '@symbiote-native/svelte/state-style'` into the compiled file,
// so the callback is resolved at run time by the engine. CALLING the module at build time is not
// fine: `specializeStateStyle(expression, types)` rewrites the author's expression into two, which
// is a behaviour the runtime then cannot correct. Only a real require/import binding is a finding.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adapterNames } from '../scripts/lib/adapter-names.mjs';

const ROOT = join(__dirname, '..');

// Modules that can change what a node commits. `host-primitives` is deliberately absent: it is a
// table of tag names, and reading it is exactly the routing a transform is allowed to do.
const PAYLOAD_CHANGING = [
  '@symbiote-native/components/specialize-state-style',
  '@symbiote-native/components/fold-host-bag',
  '@symbiote-native/components/resolve-intrinsic',
];

// Every lowering transform in the repo, located by what it READS rather than by a path list — the
// same reason `adapterNames()` reads the directory. A transform added under a new name joins this
// audit without anyone remembering to add it.
const CANDIDATES = [
  'babel-lower-host-primitives.cjs',
  'metro-vue-transformer.cjs',
  'src/preprocessor/lower-host-primitives.ts',
];

function transformFiles(): Array<{ id: string; source: string }> {
  const found: Array<{ id: string; source: string }> = [];
  for (const adapter of adapterNames()) {
    for (const candidate of CANDIDATES) {
      const path = join(ROOT, 'adapters', adapter, candidate);
      let source: string;
      try {
        source = readFileSync(path, 'utf8');
      } catch {
        continue;
      }
      if (!source.includes('host-primitives')) continue;
      found.push({ id: `${adapter}/${candidate}`, source });
    }
  }
  return found;
}

// A real binding, never a string in an emitted template. `require('x')` and `from 'x'` are the two
// forms a transform can actually call through.
function bindsTo(source: string, moduleId: string): boolean {
  const escaped = moduleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(require\\(|from )['"]${escaped}['"]`).test(source);
}

// The transforms that still carry behaviour, compared for EQUALITY so this fails in both
// directions: a new one fails, and closing one without deleting its entry fails too. That is the
// shape `tests/adapter-barrel-parity.test.ts` uses for `KNOWN_GAPS`, and the reason is the same —
// an allowlist that only fails one way silently becomes the specification.
//
// EMPTY, and it is meant to stay that way. Both Vue entries were removed on 2026-09-01 together
// with the compile-time state-style split they recorded; no transform binds a payload-changing
// module any more.
//
// The prose here used to say removing a split "moves the work into the commit path", i.e. that it
// would cost something. That was a guess and it is FALSE in both places it was measured. The split
// emitted TWO props per element — `style` and `activeStyle` — where the callback emits one, and
// neither Vue nor Solid hoists the pair, so every render built and invoked the callback twice and
// allocated two style objects. Vue, headless through the real compileSfc on 1 000 styled nodes:
// 5.2/5.1 ms with the split against 4.6/4.5 ms without, with createNode 3002, appendChild 3000,
// VISITED 3003 and WRITES 4000 byte-identical in every arm. Solid measured the same direction
// independently on 10 000 nodes.
//
// So a future entry here needs a measured reason, not an assumed one — and the assumption that
// used to live in this comment is the one to distrust first.
const CARRIES_BEHAVIOUR: readonly string[] = [];

describe('a lowering transform carries no behaviour', () => {
  // why: the control. Every assertion below iterates a discovered list, and an empty list makes
  // them all vacuous — this file would report perfect health with the locator broken.
  it('control: the transforms are found', () => {
    const ids = transformFiles().map(file => file.id);
    expect(ids.length, `found: ${ids.join(', ')}`).toBeGreaterThanOrEqual(4);
  });

  // why: THE assertion. A transform that cannot reach a payload-changing module cannot change a
  // payload, which is the structural version of the discipline this design used to rely on.
  it('binds no payload-changing module beyond the recorded set', () => {
    const offenders = transformFiles()
      .filter(file => PAYLOAD_CHANGING.some(id => bindsTo(file.source, id)))
      .map(file => file.id)
      .sort();
    expect(offenders).toEqual([...CARRIES_BEHAVIOUR].sort());
  });

  // why: emitting a runtime helper is the CORRECT shape and must not be mistaken for a violation —
  // without this row the distinction lives only in a comment, and the next person tightening the
  // regex would break Svelte while believing they had closed a gap.
  it('does not count an EMITTED runtime import as carrying behaviour', () => {
    const svelte = transformFiles().find(file => file.id.startsWith('svelte/'));
    expect(svelte, 'the svelte preprocessor was located').toBeDefined();
    expect(svelte?.source).toContain('resolveStateStyle');
    expect(CARRIES_BEHAVIOUR).not.toContain(
      'svelte/src/preprocessor/lower-host-primitives.ts',
    );
  });
});

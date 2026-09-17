// The shim's fold is keyed by INTRINSIC TAG, and one primitive can produce two of them
// (`intrinsicWhen`). A map built from `primitive.intrinsic` alone covers the first flavour and
// silently skips the second: the node still commits, it just loses its defaults — a multiline
// TextInput would never be seeded with what the single-line one is.
//
// That is the failure this file exists for, and it is the same shape Solid found one layer up: a
// projection of the spec that drops a field before anything reads it. Neither goes red on its own,
// so both need a test that names the SECOND tag explicitly.
//
// The `TextInput` entry is withheld from the shared spec (see `intrinsic-choice.test.ts` for why),
// so this injects one and takes it back out.
//
// ORDER IS LOAD-BEARING and it is the opposite of the obvious one. `BY_TAG` is built at module load,
// so the injection has to land in the spec instance the module under test will resolve: reset FIRST,
// import the spec, inject, THEN import the module. Mutating the top-level import and resetting
// afterwards looks equivalent and is not — the reset hands the module a fresh copy of the spec that
// never saw the injection, both tags come back unfolded, and the test reports exactly the defect it
// is looking for. That false red cost a debugging round before it was recognised.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SINGLE_LINE = 'text-input';
const MULTILINE = 'text-input-multiline';

// The probe was `id` -> `nativeID` until 2026-09-18, when that rename moved to `routeProp` and the
// spec stopped carrying aliases at all. A DEFAULT is what `foldHostBag` still applies, so it is what
// the second tag can still silently lose.
const SEEDED_KEY = 'ellipsizeMode';
const SEEDED_VALUE = 'tail';

let foldHostBag: (tag: string, bag: Record<string, unknown>) => unknown;

beforeAll(async () => {
  vi.resetModules();
  const spec = await import('@symbiote-native/components/host-primitives');
  Object.assign(spec.HOST_PRIMITIVES, {
    TextInput: {
      intrinsic: SINGLE_LINE,
      defaults: { [SEEDED_KEY]: { op: 'nullish', value: SEEDED_VALUE } },
      intrinsicWhen: { prop: 'multiline', intrinsic: MULTILINE },
    },
  });
  ({ foldHostBag } = await import('./fold-host-bag'));
});

afterAll(() => {
  // The reset is the cleanup here: the mutated spec copy lives only in the registry this discards.
  vi.resetModules();
});

describe('a primitive with two intrinsics', () => {
  it('folds the ALTERNATE tag, not only the base one', () => {
    expect(foldHostBag(MULTILINE, {})).toEqual({ [SEEDED_KEY]: SEEDED_VALUE });
  });

  it('still folds the base tag', () => {
    expect(foldHostBag(SINGLE_LINE, {})).toEqual({
      [SEEDED_KEY]: SEEDED_VALUE,
    });
  });

  it('leaves a tag the spec does not name completely alone', () => {
    const bag = { id: 'x' };
    // Identity, not equality: an unknown tag must not even be copied.
    expect(foldHostBag('symbiote-not-ours', bag)).toBe(bag);
  });
});

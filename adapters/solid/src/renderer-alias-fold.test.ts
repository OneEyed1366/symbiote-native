// The renderer's alias fold is written as two string constants for speed. This re-derives them from
// the shared spec, so the shortcut cannot outlive the assumption that justified it.
//
// `foldAliasKey` sits on the per-prop write path — 32 001 prop writes on a benchmark create — so it
// is one string comparison rather than a Map lookup over each primitive's `aliases`. That is only
// correct while every lowerable primitive declares the SAME single alias pair. The day a second
// pair appears, or a primitive stops sharing, this fails and the renderer has to carry a real map.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);

const ALIAS_MAPS: Record<string, string>[] = Object.values(
  HOST_PRIMITIVES as Record<string, { aliases: Record<string, string> }>,
).map(spec => spec.aliases);

// This file was RED for part of 2026-09-01 and the entry saying so has been deleted rather than
// amended: `SafeAreaView` landed with `aliases: {}` where every other primitive carries `ID_ALIAS`,
// and both assertions below reported it. The fork was resolved on the WRAPPER side — SafeAreaView
// now carries `ID_ALIAS` and `id?: string` is declared on all five wrappers, which also closed a
// real RN parity gap, since upstream's SafeAreaView takes `ViewProps` and accepts `id` where none
// of ours did.
//
// Kept as a note because the shape recurs: these two assertions are what license the renderer's
// fold being ONE string comparison on the per-prop write path (32 001 writes on a benchmark
// create). The moment a primitive stops sharing the pair they go red again, and the answer is
// either a real per-primitive map here or a wrapper-side fix — never relaxing the assertions, which
// would leave the renderer silently dropping `id` on one primitive.
describe('the renderer alias fold against the shared spec', () => {
  it('every primitive declares exactly one alias pair', () => {
    expect(ALIAS_MAPS.length).toBeGreaterThan(0);
    for (const aliases of ALIAS_MAPS) {
      expect(Object.entries(aliases)).toHaveLength(1);
    }
  });

  it('all primitives share the same pair, and it is id -> nativeID', () => {
    const pairs = new Set(
      ALIAS_MAPS.map(aliases => Object.entries(aliases)[0].join(' -> ')),
    );
    expect([...pairs]).toEqual(['id -> nativeID']);
  });
});

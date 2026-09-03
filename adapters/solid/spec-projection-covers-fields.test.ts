// The transform projects `HOST_PRIMITIVES` into a smaller per-name record at load. That projection
// is a WHITELIST and it fails in silence: a field the shared spec grows and the projection does not
// copy never reaches the detections, which behave exactly as if the spec had not declared it.
//
// Measured 2026-08-31. `intrinsicWhen` — the two-intrinsic selector for TextInput — was implemented
// end to end, and every `multiline` case still lowered to the single-line tag because the field was
// dropped one line before anything could read it. Nothing was red; the detection simply saw an
// entry with no selector and did what a single-tag primitive does.
//
// So the whitelist is checked against the spec rather than trusted, the same move as
// `scripts/lib/adapter-names.mjs`: a list written before a field exists cannot report the field it
// does not contain.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);
const { SPEC_FIELDS_READ, SPEC_FIELDS_IGNORED } = require_(
  './babel-lower-host-primitives.cjs',
);

const declared = new Set<string>();
for (const entry of Object.values(HOST_PRIMITIVES as Record<string, object>)) {
  for (const key of Object.keys(entry)) declared.add(key);
}

describe('the spec projection against the spec', () => {
  it('accounts for every field any primitive declares', () => {
    const accounted = new Set([...SPEC_FIELDS_READ, ...SPEC_FIELDS_IGNORED]);
    const unaccounted = [...declared].filter(key => !accounted.has(key));
    expect(
      unaccounted,
      'a new spec field is neither read nor explicitly ignored by this transform',
    ).toEqual([]);
  });

  // Break-test for the assertion above: it is only meaningful if `declared` is non-empty and the
  // comparison can fail. An empty spec read would make every list "account for everything".
  it('reads a non-trivial field set out of the spec', () => {
    expect(declared.has('intrinsic')).toBe(true);
    expect(declared.size).toBeGreaterThan(1);
  });
});

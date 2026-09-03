// Every primitive that DECLARES `intrinsicWhen` must be honoured by the runtime resolver — derived
// from the spec, never listed here.
//
// `resolve-intrinsic.test.ts` beside this file covers the rule in depth, and does it against
// `TextInput` by name. That is the right shape for testing the LOGIC and the wrong shape for
// testing COVERAGE: today TextInput is the only primitive with the field, so a second one could be
// added and nothing would report that the resolver never sees it. This file is the coverage half,
// and it is deliberately shallow — one round trip per declaring primitive.
//
// Why the drop-between-file-and-reader hazard does NOT apply here, stated so nobody adds a
// projection check that guards nothing: `resolve-intrinsic.ts` builds its map by iterating
// `HOST_PRIMITIVES` and reading `intrinsicWhen` off each entry, so there is no whitelist to fall
// out of. The hazard that DOES apply is a declaring primitive nobody exercises.
import { describe, expect, it } from 'vitest';
import {
  HOST_PRIMITIVES,
  type IHostPrimitive,
} from '../../host-primitives.cjs';
import { resolveIntrinsicTag } from '../resolve-intrinsic';

const DECLARING: ReadonlyArray<readonly [string, IHostPrimitive]> =
  Object.entries(HOST_PRIMITIVES).filter(
    (entry): entry is [string, IHostPrimitive] =>
      entry[1].intrinsicWhen !== undefined,
  );

describe('intrinsicWhen coverage', () => {
  // why: the control. Every assertion below iterates a derived list, and an EMPTY list makes them
  // all vacuous — `it.each([])` is a pass. The field has been withheld from the spec before while
  // its runtime half was wired, which is exactly when this file must say so rather than go green.
  it('control: at least one primitive declares intrinsicWhen', () => {
    expect(DECLARING.map(([name]) => name)).not.toHaveLength(0);
  });

  // why: the shape is read positionally by the resolver, so a MALFORMED entry — a missing `prop`,
  // an `intrinsic` equal to the base — resolves to the wrong native view with every other test in
  // this directory green.
  //
  // What this does NOT catch, stated because the first draft of this comment claimed it did: a
  // RENAMED field (`when:` instead of `intrinsicWhen:`). The filter above keys on the same name the
  // resolver keys on, so a rename is invisible to both. Break-tested — renaming it today reddens
  // the CONTROL, not this row, because TextInput is the only declaring primitive and the list goes
  // empty. **That protection dies the moment a second primitive declares the field**, and nothing
  // here would notice. Catching a rename needs a check that does not use the name, which nobody
  // has written.
  it.each(DECLARING)(
    '%s declares a usable { prop, intrinsic }',
    (_name, primitive) => {
      const when = primitive.intrinsicWhen;
      expect(typeof when?.prop, 'intrinsicWhen.prop').toBe('string');
      expect(typeof when?.intrinsic, 'intrinsicWhen.intrinsic').toBe('string');
      expect(when?.intrinsic).not.toBe(primitive.intrinsic);
    },
  );

  // why: THE coverage assertion — the resolver must actually act on what the spec declares. A
  // primitive added to the spec but unreachable from the resolver fails here and nowhere else.
  it.each(DECLARING)(
    '%s resolves both ways through the runtime resolver',
    (_name, primitive) => {
      const base = primitive.intrinsic;
      const { prop, intrinsic: alternate } = primitive.intrinsicWhen ?? {
        prop: '',
        intrinsic: '',
      };

      expect(
        resolveIntrinsicTag(base, { [prop]: true }),
        'prop true -> alternate',
      ).toBe(alternate);
      expect(resolveIntrinsicTag(base, {}), 'prop absent -> base').toBe(base);
      expect(
        resolveIntrinsicTag(alternate, {}),
        'alternate is never re-resolved',
      ).toBe(alternate);
    },
  );
});

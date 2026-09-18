// `imports: [SYMBIOTE_ELEMENTS]` is the only supported spelling, and this keeps it that way.
//
// The barrel used to name every element directive class so an app could import narrowly. That became
// unsafe on 2026-09-18: a tag directive is withheld from runtime matching now
// (`./runtime-matching`), so it declares types and does nothing else, and what makes its element
// WORK is two directives that ride the array — `SymbioteStyleHost`, which claims `[style]` so an RN
// style array never reaches Angular's styling engine, and `SymbioteCallbackHost`, which claims the
// `on*` names before `setDomProperty` throws NG0306 on them.
//
// A narrow `imports: [ViewElement]` would type-check and commit most props correctly, then throw on
// a device the first time the app wrote an array style. There is no compile-time tell for it at all,
// which is why the narrow surface was removed rather than documented.
//
// Read off the barrel MODULE rather than a maintained list, so a class added back by hand fails here
// the same day.

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import * as barrel from './index';
import { SYMBIOTE_ELEMENTS } from './elements';

/** The two attribute/tag hosts are part of the array's contract and are named on purpose. */
const EXPORTED_ON_PURPOSE = new Set([
  'SymbioteCallbackHost',
  'SymbioteStyleHost',
]);

describe('the element directives are reachable only through SYMBIOTE_ELEMENTS', () => {
  // why: a narrow import of one element class loses the style claim and the callback claim with no
  // diagnostic, and fails first on a device. The array is what carries them.
  it('names no element directive class in the package barrel', () => {
    const inTheArray = new Set(
      SYMBIOTE_ELEMENTS.map(directive =>
        typeof directive === 'function' ? directive.name : '',
      ),
    );

    // The census before the claim: an array that resolved to nothing would make the check below pass
    // against an empty set.
    expect(inTheArray.size).toBeGreaterThan(20);

    const leaked = Object.keys(barrel)
      .filter(name => inTheArray.has(name) && !EXPORTED_ON_PURPOSE.has(name))
      .sort();
    expect(leaked).toEqual([]);
  });

  // why: the array itself, and the base class an app names in a TYPE rather than in `imports`, must
  // go on being exported — a check that only forbids would be satisfied by exporting nothing.
  it('goes on naming the array and the base class', () => {
    expect(Object.keys(barrel)).toContain('SYMBIOTE_ELEMENTS');
    expect(Object.keys(barrel)).toContain('SymbioteElement');
  });
});

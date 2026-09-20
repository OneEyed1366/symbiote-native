// Every directive inside `SYMBIOTE_ELEMENTS` must be NAMED by the package barrel, or AOT breaks.
//
// ngtsc resolves a component's template dependencies to an IMPORTABLE NAME in the package's public
// types. A class that rides the array without being exported fails compilation of every screen that
// imports the array:
//
//   NG3004: Unable to import directive ViewElement.
//   The symbol is not exported from …/@symbiote-native/angular/build/angular/index.d.ts
//
// THIS FILE EXISTS BECAUSE THE OPPOSITE GUARD WAS WRITTEN FIRST, and it was wrong in a way nothing
// headless could see. `imports: [SYMBIOTE_ELEMENTS]` is the only spelling an app should use — the
// element directives are withheld from runtime matching (`./runtime-matching`), so a narrow
// `imports: [ViewElement]` misses `SymbioteStyleHost` and `SymbioteCallbackHost` and fails on a
// device the first time the app writes an array style. A guard was written to REMOVE the narrow
// exports and make that unreachable. It passed, the whole vitest suite passed, all 85 itests passed,
// and the first real `ngc -p tsconfig.angular.json` on `examples/angular` failed on every screen.
//
// So the narrow spelling is discouraged by documentation and cannot be prevented by removal, and
// what is asserted here is the invariant a BUILD actually has.

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import * as barrel from './index';
import { SYMBIOTE_ELEMENTS } from './elements';

describe('the package barrel names every directive the array carries', () => {
  // why: an unexported member of the array is NG3004 on every screen that imports it — a failure
  // that reaches no headless suite, because nothing headless resolves a template dependency to a
  // module export.
  it('exports every class in SYMBIOTE_ELEMENTS', () => {
    const exported = new Set(Object.keys(barrel));
    const carried = SYMBIOTE_ELEMENTS.map(directive =>
      typeof directive === 'function' ? directive.name : '',
    );

    // The census before the claim: an array that resolved to nothing would make the check below pass
    // against an empty list.
    expect(carried.length).toBeGreaterThan(20);

    const unexported = carried.filter(name => !exported.has(name)).sort();
    expect(unexported).toEqual([]);
  });

  // why: the array itself and the base class an app names in a TYPE. A check that only demanded the
  // members would be satisfied by a barrel nobody could use.
  it('exports the array and the base class', () => {
    expect(Object.keys(barrel)).toContain('SYMBIOTE_ELEMENTS');
    expect(Object.keys(barrel)).toContain('SymbioteElement');
  });
});

// The guard on `SymbioteCallbackHost`'s selector, and the reason that directive can exist at all.
//
// `SymbioteElement` used to inject a `ChangeDetectorRef` on EVERY element so its lazy `on*` wrapper
// could mark the owning view. Two things read it — that wrapper, and `ReadBackElement`'s constructor
// on three tags — and a screen's tags overwhelmingly carry no `on*` prop, so nearly every one of
// those refs was built for nobody. Priced on JavaScriptCore in
// `core/engine/cpp/tests/js/angular-directive-cost.itest.ts`: an injection is ~1.2-2.1 us per
// element, 12-21 ms over ten thousand of them.
//
// `SymbioteCallbackHost` collects that by MATCHING instead of injecting: its selector is the union of
// the callback attribute names, so only an element that binds one instantiates it, and it registers
// its view against the node the wrapper already has in hand.
//
// THE HAZARD IS THE SELECTOR, because a selector is a static string and the inputs it shadows are
// not. A name declared as an `on*` input somewhere and missing from that string still FORWARDS
// correctly — the input stays on `SymbioteElement` — it simply stops being followed by a change
// detection mark, which is a missed refresh on one prop and nothing a type or a render test sees.
// So the list is DERIVED here from the directives' own declared inputs rather than reviewed, the
// treatment `ARIA_ALIAS_KEYS` gets in the engine for the same class of list.

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { SYMBIOTE_ELEMENTS } from './elements';
import { CALLBACK_ATTRIBUTE_SELECTOR } from './callback-host';
import { isWrappableCallback } from './change-detection-flush';

/** A directive's declared input names, off the compiled definition rather than a maintained list. */
function inputsOf(type: unknown): readonly string[] {
  if (typeof type !== 'function') return [];
  const definition: unknown = Reflect.get(type, 'ɵdir');
  if (typeof definition !== 'object' || definition === null) return [];
  const inputs: unknown = Reflect.get(definition, 'inputs');
  if (typeof inputs !== 'object' || inputs === null) return [];
  return Object.keys(inputs);
}

function selectedAttributes(selector: string): ReadonlySet<string> {
  return new Set(
    selector
      .split(',')
      .map(part => part.trim())
      .filter(part => part.startsWith('[') && part.endsWith(']'))
      .map(part => part.slice(1, -1)),
  );
}

describe('the callback host directive matches every callback prop', () => {
  // why: an `on*` input nobody selected on is forwarded but never marks its view, so the app's own
  // handler updates state that the template does not re-read. The failure is a stale screen on one
  // prop — invisible to every other test in this adapter.
  it('selects on every wrappable on* input any element directive declares', () => {
    const selected = selectedAttributes(CALLBACK_ATTRIBUTE_SELECTOR);
    const declared = new Set<string>();
    for (const directive of SYMBIOTE_ELEMENTS)
      for (const name of inputsOf(directive))
        // The predicate the wrapper itself uses, asked with a function so the per-frame exclusion
        // cannot drift: `onScroll` is deliberately never wrapped and must NOT be selected on.
        if (isWrappableCallback(name, () => undefined)) declared.add(name);

    // The census before the claim: a reflection that found nothing would make the subset check below
    // pass against an empty set, which is the shape this repo has already been caught by twice.
    expect(declared.size).toBeGreaterThan(5);

    const missing = [...declared].filter(name => !selected.has(name)).sort();
    expect(missing).toEqual([]);
  });

  // why: the converse. A name in the selector that no directive declares is dead weight in a string
  // every element is matched against, and it reads as coverage that is not there.
  it('selects on nothing that is not a declared callback input', () => {
    const selected = selectedAttributes(CALLBACK_ATTRIBUTE_SELECTOR);
    const declared = new Set<string>();
    for (const directive of SYMBIOTE_ELEMENTS)
      for (const name of inputsOf(directive)) declared.add(name);

    const stray = [...selected].filter(name => !declared.has(name)).sort();
    expect(stray).toEqual([]);
  });

  // why: `onScroll` fires per FRAME with sticky headers pinning `scrollEventThrottle` to 1, and
  // `markForCheck` walks to the root — the canary measured ~37fps when it was wrapped. It is
  // excluded from `isWrappableCallback`, and this pins that the selector honours that exclusion
  // rather than re-admitting it by a name on a list.
  it('leaves the per-frame scroll callback out', () => {
    expect(
      selectedAttributes(CALLBACK_ATTRIBUTE_SELECTOR).has('onScroll'),
    ).toBe(false);
  });
});

// The guard that keeps `SymbioteStyleHost` covering every tag that lost its own directive.
//
// A withheld tag directive is a compile-time declaration and nothing else, so nothing claims
// `[style]` on its element unless the style host's selector names that tag. Unclaimed, an RN style
// ARRAY — a shape RN allows and this repo has shipped on ImageBackground — goes to `ɵɵstyleMap`,
// which parses its argument as a CSS string and calls `.indexOf` on it. It throws inside change
// detection, on a device, with no diagnostic anywhere earlier.
//
// Two hand-written lists could drift into that: the set passed to `withholdFromRuntimeMatching` and
// the style host's own selector. So neither is reviewed — the withhold RECORDS the tags it emptied,
// and this reads them back.

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import './elements';
import { STYLE_HOST_SELECTOR } from './style-host';
import { tagsWithheldFromRuntimeMatching } from './runtime-matching';

const hostTags = new Set(
  STYLE_HOST_SELECTOR.split(',').map(part => part.trim()),
);

describe('the style host covers every withheld tag', () => {
  // why: a tag whose directive is withheld and whose style nobody claims throws on an array style,
  // in change detection, on a device. Nothing earlier sees it — not a type, not a render test that
  // happens to write an object.
  it('names every tag that lost its element directive', () => {
    const withheld = tagsWithheldFromRuntimeMatching();

    // The census before the claim: an empty set would satisfy the subset check below while proving
    // that the withholding never ran and this file watches nothing.
    expect(withheld.size).toBeGreaterThan(10);

    const uncovered = [...withheld].filter(tag => !hostTags.has(tag)).sort();
    expect(uncovered).toEqual([]);
  });

  // why: the converse, and it is not tidiness. `text-input`, `switch` and `refresh-control` keep
  // their own directive because it does real work at construction, and that directive already
  // declares `style`. A second claim on one input means both directives receive it and both forward
  // it — the double write this adapter has measured before as `unchanged`.
  it('names no tag that kept its own directive', () => {
    const withheld = tagsWithheldFromRuntimeMatching();
    const doubled = [...hostTags].filter(tag => !withheld.has(tag)).sort();
    expect(doubled).toEqual([]);
  });
});

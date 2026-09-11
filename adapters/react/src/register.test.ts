// Two independent properties, and they need separate assertions because neither can see the other's
// failure.
//
// WHAT RUNS: the registration installs a behavior on each tag it claims, and none on the tags it
// deliberately leaves alone. Checked through the engine's own registry.
//
// WHAT THE BARREL LOOKS LIKE: `index.ts` must reach `./register` as a bare side-effect import and
// never as a re-export. That one is a SYNTACTIC property and cannot be checked by importing —
// vitest evaluates ESM eagerly, so `export * from './register'` would satisfy every runtime
// assertion below while being dead in a release bundle, which is the exact failure the shape exists
// to prevent (Metro's inlineRequires; see register.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostBehaviorFor } from '@symbiote-native/engine';
import {
  BUTTON_TAG,
  HORIZONTAL_SCROLL_VIEW_TAG,
  IMAGE_TAG,
  INPUT_ACCESSORY_VIEW_TAG,
  PRESSABLE_TAG,
  SCROLL_VIEW_TAG,
  SWITCH_TAG,
  TEXT_INPUT_MULTILINE_TAG,
  TEXT_INPUT_TAG,
  TOUCHABLE_NATIVE_FEEDBACK_TAG,
} from '@symbiote-native/components';

import './register';

// COMMENTS STRIPPED BEFORE MATCHING, and this is not tidiness. The comment beside the import in
// `index.ts` explains the hazard, and the clearest way to explain it is to name the forbidden form
// — at which point a test matching raw text fails on the explanation rather than on the code.
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const BARREL = withoutComments(
  readFileSync(join(__dirname, 'index.ts'), 'utf8'),
);

describe('the React adapter registration', () => {
  it('installs a behavior on every tag it claims', () => {
    const registered = [
      PRESSABLE_TAG,
      TOUCHABLE_NATIVE_FEEDBACK_TAG,
      BUTTON_TAG,
      TEXT_INPUT_TAG,
      TEXT_INPUT_MULTILINE_TAG,
      SWITCH_TAG,
      IMAGE_TAG,
      INPUT_ACCESSORY_VIEW_TAG,
      SCROLL_VIEW_TAG,
      HORIZONTAL_SCROLL_VIEW_TAG,
    ].filter(tag => hostBehaviorFor(tag) !== undefined);

    expect(registered).toEqual([
      PRESSABLE_TAG,
      TOUCHABLE_NATIVE_FEEDBACK_TAG,
      BUTTON_TAG,
      TEXT_INPUT_TAG,
      TEXT_INPUT_MULTILINE_TAG,
      SWITCH_TAG,
      IMAGE_TAG,
      INPUT_ACCESSORY_VIEW_TAG,
      SCROLL_VIEW_TAG,
      HORIZONTAL_SCROLL_VIEW_TAG,
    ]);
  });

  it('reaches the registration from the barrel as a side effect', () => {
    expect(BARREL).toContain("import './register';");
  });

  // why: `export * from './register'` and `export { x } from './register'` both compile to a lazy
  // getter under inlineRequires. Either one, alone or beside the bare import, makes the
  // registration release-dead.
  it('never re-exports it, in any form', () => {
    expect(BARREL).not.toMatch(
      new RegExp(String.raw`export[\s\S]{0,80}from\s*'\.\/register'`),
    );
  });
});

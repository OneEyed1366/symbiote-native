// Поведения ставятся на свои теги и не трогают остальные, проверка через реестр движка
// Импорт в `index.ts` и `bootstrap.ts` голый, не re-export, проверка по тексту: vitest грузит ESM
// сразу, а re-export мёртв в release под `inlineRequires` (см. register.ts)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostBehaviorFor } from '@symbiote-native/engine';
import {
  BUTTON_TAG,
  CHECKBOX_TAG,
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

const BOOTSTRAP = withoutComments(
  readFileSync(join(__dirname, 'bootstrap.ts'), 'utf8'),
);

describe('the React adapter registration', () => {
  it('installs a behavior on every tag it claims', () => {
    const registered = [
      PRESSABLE_TAG,
      TOUCHABLE_NATIVE_FEEDBACK_TAG,
      BUTTON_TAG,
      CHECKBOX_TAG,
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
      CHECKBOX_TAG,
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

  // An app written in intrinsic tags never imports the barrel, so on Android nothing else reached
  // the registry before the first mount and its scroll view hosted several native children
  it('reaches the registration from the app entry as a side effect', () => {
    expect(BOOTSTRAP).toContain("import './register';");
    expect(BOOTSTRAP).not.toMatch(
      new RegExp(String.raw`export[\s\S]{0,80}from\s*'\.\/register'`),
    );
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

// `InputAccessoryView.js` on Android does `console.warn(...); return null` — the whole component,
// children included, renders NOTHING. Until 2026-09-20 this table resolved the tag to a plain
// `RCTView`, committing a real, laid-out, potentially visible node plus its whole child subtree — a
// real divergence from vendor, not a harmless degrade. `VOID_COMPONENT` is the engine primitive that
// matches vendor exactly: see `core/engine/cpp/tests/js/tree-rules.itest.ts` for the commit-walk
// contract (a void node contributes neither itself nor its children).
import { describe, expect, it } from 'vitest';
import { VOID_COMPONENT } from '@symbiote-native/engine';
import { descriptorFor } from './index.android';

describe('input-accessory-view on Android', () => {
  it('resolves to the void component, matching vendor’s null render', () => {
    expect(descriptorFor('input-accessory-view')).toEqual({
      component: VOID_COMPONENT,
      isText: false,
    });
  });
});

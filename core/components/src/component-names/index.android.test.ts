// Android component names that differ from a ViewManager lookup because RN's JS routes elsewhere.
import { describe, expect, it } from 'vitest';
import { VOID_COMPONENT } from '@symbiote-native/engine';
import { descriptorFor } from './index.android';

describe('input-accessory-view on Android', () => {
  // why: `InputAccessoryView.js` on Android does `console.warn(...); return null` — the whole
  // component, children included, renders nothing; VOID_COMPONENT commits neither node nor subtree.
  it('resolves to the void component, matching vendor’s null render', () => {
    expect(descriptorFor('input-accessory-view')).toEqual({
      component: VOID_COMPONENT,
      isText: false,
    });
  });
});

describe('safe-area-view on Android', () => {
  // why: a DELIBERATE divergence. RN's deprecated SafeAreaView is a plain View on Android and
  // applies no insets; we commit the registered `RCTSafeAreaView`, which does, so a screen written
  // once is safe on both platforms without react-native-safe-area-context.
  it('commits the inset-applying RCTSafeAreaView, unlike RN', () => {
    expect(descriptorFor('safe-area-view')).toEqual({
      component: 'RCTSafeAreaView',
      isText: false,
    });
  });
});

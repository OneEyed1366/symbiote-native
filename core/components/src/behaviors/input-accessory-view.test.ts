// InputAccessoryView off iOS, against RN's InputAccessoryView.js:110-113: it warns and renders
// nothing. The render half is the void component (component-names/index.android.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHostBehaviors,
  createElement,
  Platform,
} from '@symbiote-native/engine';

import { installRecordingFabric } from '../../../test-utils/src/index';
import {
  INPUT_ACCESSORY_VIEW_TAG,
  registerInputAccessoryViewBehavior,
} from './input-accessory-view';

installRecordingFabric();
const originalOs = Platform.OS;

function setOs(os: string): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  registerInputAccessoryViewBehavior();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  setOs(originalOs);
  warn.mockRestore();
  clearHostBehaviors();
});

describe('input-accessory-view platform support (Positive — no throwing path)', () => {
  // why: RN tells the developer the component does nothing on this platform.
  it('warns that it is iOS-only when created on Android', () => {
    setOs('android');
    createElement('RCTView', false, INPUT_ACCESSORY_VIEW_TAG);
    expect(warn).toHaveBeenCalledWith(
      '<InputAccessoryView> is only supported on iOS.',
    );
  });

  // why: on iOS it is a real native view; nothing to warn about.
  it('stays silent on iOS', () => {
    setOs('ios');
    createElement('RCTInputAccessoryView', false, INPUT_ACCESSORY_VIEW_TAG);
    expect(warn).not.toHaveBeenCalled();
  });
});

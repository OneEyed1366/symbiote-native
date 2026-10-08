// TextInput.js passes `onSelectionChangeShouldSetResponder` on the iOS branch only

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  listenerFor,
  Platform,
  type ISymbioteEvent,
} from '@symbiote-native/engine';

import { registerTextInputBehavior, TEXT_INPUT_TAG } from './text-input';

installRecordingFabric();
let nextRootTag = 7_500;
const originalOs = Platform.OS;
const SELECTION: ISymbioteEvent = { nativeEvent: {} };
const SELECTION_CLAIM = 'selectionChangeShouldSetResponder';

function setOs(os: string): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function claimOnSelection(): unknown {
  const node = createElement(
    'RCTSinglelineTextInputView',
    false,
    TEXT_INPUT_TAG,
  );
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return listenerFor(node, SELECTION_CLAIM)?.(SELECTION);
}

beforeEach(() => registerTextInputBehavior());
afterEach(() => {
  setOs(originalOs);
  clearHostBehaviors();
});

describe('text input claims the responder on a selection change', () => {
  it('claims it on iOS, for a drag on the selection handles', () => {
    setOs('ios');

    expect(claimOnSelection()).toBe(true);
  });

  it('does not claim it on Android', () => {
    setOs('android');

    expect(claimOnSelection()).not.toBe(true);
  });
});

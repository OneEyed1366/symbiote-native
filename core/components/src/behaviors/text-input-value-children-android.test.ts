// Android's `TextInput.js:737-741`: `value` and children together throw. Its own file because the
// platform split is read at load, as in `pressable-android.test.ts`
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installRecordingFabric } from '../../../test-utils/src/index';

type IEngineModule = typeof import('@symbiote-native/engine');

vi.mock('@symbiote-native/engine', async () => {
  const realEngine = await vi.importActual<IEngineModule>(
    '@symbiote-native/engine',
  );
  return {
    ...realEngine,
    Platform: {
      ...realEngine.Platform,
      OS: 'android',
      select: <T>(spec: {
        android?: T;
        ios?: T;
        native?: T;
        default?: T;
      }): T | undefined => {
        if ('android' in spec) return spec.android;
        if ('native' in spec) return spec.native;
        return spec.default;
      },
    },
  };
});

import {
  appendChild,
  clearHostBehaviors,
  createElement,
  routeProp,
} from '@symbiote-native/engine';
import { registerTextInputBehavior, TEXT_INPUT_TAG } from './text-input';

installRecordingFabric();

const ANDROID_TEXT_INPUT = 'AndroidTextInput';
const MESSAGE = 'Cannot specify both value and children.';

afterEach(() => clearHostBehaviors());

describe('a TextInput with value and children on Android', () => {
  it('throws when a child lands under a node that has a value', () => {
    registerTextInputBehavior();
    const input = createElement(ANDROID_TEXT_INPUT, false, TEXT_INPUT_TAG);
    routeProp(input, 'value', 'typed');
    const child = createElement('RCTRawText', false, 'raw-text');

    expect(() => appendChild(input, child)).toThrow(MESSAGE);
  });

  it('accepts a child when there is no value', () => {
    registerTextInputBehavior();
    const input = createElement(ANDROID_TEXT_INPUT, false, TEXT_INPUT_TAG);
    const child = createElement('RCTRawText', false, 'raw-text');

    expect(() => appendChild(input, child)).not.toThrow();
  });
});

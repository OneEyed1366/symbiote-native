// Android-ветки `Image.android.js` и `TextInput.js`, которые iOS-сборка не компилирует

import {
  registerImageBehavior,
  registerTextInputBehavior,
} from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

registerImageBehavior();
registerTextInputBehavior();

function payloadFor(
  viewName: string,
  tag: string,
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(1);
  const node = createElement(viewName, false, tag);
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return committedPayloadOf(node) ?? {};
}

describe('Image on Android', () => {
  // `aria-hidden` на Android прячет потомков через `importantForAccessibility`, а не `accessible`
  it('hides descendants for aria-hidden true and nothing for false', () => {
    const hidden = payloadFor('RCTImageView', 'image', {
      src: 'https://a/1.png',
      'aria-hidden': true,
    });
    const shown = payloadFor('RCTImageView', 'image', {
      src: 'https://a/1.png',
      'aria-hidden': false,
    });

    expect(hidden.importantForAccessibility).toBe('no-hide-descendants');
    expect(shown.importantForAccessibility).toBe(undefined);
  });

  // Android читает `aria-labelledby`, поэтому он становится `accessibilityLabelledBy`
  it('keeps aria-labelledby as accessibilityLabelledBy', () => {
    const payload = payloadFor('RCTImageView', 'image', {
      src: 'https://a/1.png',
      'aria-labelledby': 'a, b',
    });

    expect(payload.accessibilityLabelledBy).toEqual(['a', 'b']);
  });

  // `Image.android.js:253-259`: `loadingIndicatorSource` уходит голым uri в `loadingIndicatorSrc`
  it('sends the loading indicator as a bare uri', () => {
    const payload = payloadFor('RCTImageView', 'image', {
      src: 'https://a/1.png',
      loadingIndicatorSource: { uri: 'https://a/spinner.png' },
    });

    expect(payload.loadingIndicatorSrc).toBe('https://a/spinner.png');
  });
});

const RED = 0xff_ff_00_00;
const BLUE = 0xff_00_00_ff;
// A colour int is signed on Android (`processColor.js`: `| 0x0`)
const signed = (argb: number): number => argb | 0;

describe('the selection colours of a TextInput on Android', () => {
  // `TextInput.js:745-752`: caret and handle follow `selectionColor` unless authored
  it('give caret and handle the selectionColor, and keep an authored one', () => {
    const coalesced = payloadFor('AndroidTextInput', 'text-input', {
      selectionColor: 'red',
    });
    const authored = payloadFor('AndroidTextInput', 'text-input', {
      selectionColor: 'red',
      cursorColor: 'blue',
    });

    expect(coalesced.cursorColor).toBe(signed(RED));
    expect(coalesced.selectionHandleColor).toBe(signed(RED));
    expect(authored.cursorColor).toBe(signed(BLUE));
    expect(authored.selectionHandleColor).toBe(signed(RED));
  });
});

describe('a multiline TextInput on Android', () => {
  // 5pt сверху у RN только на iOS (`TextInput.js:767`)
  it('gets no top inset', () => {
    const payload = payloadFor('AndroidTextInput', 'text-input-multiline', {});

    expect(payload.paddingTop).toBe(undefined);
  });
});

report();

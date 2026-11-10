// Prop-кейсы `Text-itest` из RN: что Fabric разобрал из payload абзаца

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, findByTestId, it, mounted, report } from './harness';

const PROBE_ID = 'probe';

function paragraphProps(
  props: Record<string, unknown>,
): Record<string, string> {
  const surface = createSurface(1);
  const text = createElement('RCTText', true, 'text');
  routeProp(text, 'testID', PROBE_ID);
  for (const [name, value] of Object.entries(props))
    routeProp(text, name, value);
  appendChild(text, createRawText('hello'));
  surface.appendChild(text);
  surface.commit();
  return findByTestId(PROBE_ID, mounted())?.props ?? {};
}

describe('Text defaults', () => {
  it('has allowFontScaling true and ellipsizeMode tail with no props', () => {
    const props = paragraphProps({});

    expect(props.allowFontScaling).toBe('true');
    expect(props.ellipsizeMode).toBe('tail');
  });

  it('has adjustsFontSizeToFit off by default and carries true', () => {
    expect(paragraphProps({}).adjustsFontSizeToFit).toBe(undefined);
    expect(
      paragraphProps({ adjustsFontSizeToFit: true }).adjustsFontSizeToFit,
    ).toBe('true');
  });

  it('is not selectable by default and carries true', () => {
    expect(paragraphProps({}).selectable).toBe(undefined);
    expect(paragraphProps({ selectable: false }).selectable).toBe(undefined);
    expect(paragraphProps({ selectable: true }).selectable).toBe('true');
  });
});

describe('Text allowFontScaling', () => {
  for (const value of [true, false]) {
    it(`carries ${value}`, () => {
      expect(paragraphProps({ allowFontScaling: value }).allowFontScaling).toBe(
        String(value),
      );
    });
  }
});

describe('Text ellipsizeMode', () => {
  // `clip` у Fabric значение по умолчанию, поэтому в разобранных props его нет
  it('leaves clip out of the parsed props', () => {
    expect(paragraphProps({ ellipsizeMode: 'clip' }).ellipsizeMode).toBe(
      undefined,
    );
  });

  for (const mode of ['head', 'middle', 'tail']) {
    it(`carries ${mode}`, () => {
      expect(paragraphProps({ ellipsizeMode: mode }).ellipsizeMode).toBe(mode);
    });
  }
});

describe('Text maxFontSizeMultiplier', () => {
  for (const value of [-1, 0, 1, 3, 1_000]) {
    it(`carries ${value}`, () => {
      expect(
        paragraphProps({ maxFontSizeMultiplier: value }).maxFontSizeMultiplier,
      ).toBe(String(value));
    });
  }
});

describe('Text numberOfLines', () => {
  for (const value of [-1, 0]) {
    it(`leaves ${value} out of maximumNumberOfLines`, () => {
      expect(
        paragraphProps({ numberOfLines: value }).maximumNumberOfLines,
      ).toBe(undefined);
    });
  }

  for (const value of [3, 1_000]) {
    it(`carries ${value}`, () => {
      expect(
        paragraphProps({ numberOfLines: value }).maximumNumberOfLines,
      ).toBe(String(value));
    });
  }
});

describe('Text style and aria', () => {
  for (const direction of ['rtl', 'ltr', 'auto']) {
    it(`carries writingDirection ${direction}`, () => {
      expect(
        paragraphProps({ style: { writingDirection: direction } })
          .writingDirection,
      ).toBe(direction);
    });
  }

  it('turns aria-hidden into importantForAccessibility', () => {
    expect(
      paragraphProps({ 'aria-hidden': true }).importantForAccessibility,
    ).toBe('no-hide-descendants');
  });
});

report();

// Prop-кейсы `Image-itest` из RN: что Fabric разобрал из payload картинки

import {
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';
import { registerImageBehavior } from '@symbiote-native/components';

import { describe, expect, findByTestId, it, mounted, report } from './harness';

registerImageBehavior();

const PROBE_ID = 'probe';
const SOURCE = { uri: 'https://a/logo.png' };

function imageProps(props: Record<string, unknown>): Record<string, string> {
  const surface = createSurface(1);
  const image = createElement('RCTImageView', false, 'image');
  routeProp(image, 'testID', PROBE_ID);
  for (const [name, value] of Object.entries(props))
    routeProp(image, name, value);
  surface.appendChild(image);
  surface.commit();
  return findByTestId(PROBE_ID, mounted())?.props ?? {};
}

describe('Image props as Fabric parsed them', () => {
  it('has overflow hidden and resizeMode cover with no props', () => {
    const props = imageProps({});

    expect(props.overflow).toBe('hidden');
    expect(props.resizeMode).toBe('cover');
  });

  it('carries blurRadius', () => {
    expect(imageProps({ blurRadius: 10, source: SOURCE }).blurRadius).toBe(
      '10',
    );
  });

  it('carries width and height props', () => {
    const props = imageProps({ width: 100, height: 100, source: SOURCE });

    expect(props.width).toBe('100');
    expect(props.height).toBe('100');
  });

  it('carries width, height and resizeMode from the style', () => {
    const props = imageProps({
      style: { width: 100, height: 100, resizeMode: 'contain' },
      source: SOURCE,
    });

    expect(props.width).toBe('100');
    expect(props.height).toBe('100');
    expect(props.resizeMode).toBe('contain');
  });

  it('carries tintColor as a color', () => {
    expect(imageProps({ tintColor: 'red', source: SOURCE }).tintColor).toBe(
      'rgba(255, 0, 0, 1)',
    );
  });
});

describe('Image resizeMode', () => {
  it('is cover by default and when set to cover', () => {
    expect(imageProps({ source: SOURCE }).resizeMode).toBe('cover');
    expect(imageProps({ resizeMode: 'cover', source: SOURCE }).resizeMode).toBe(
      'cover',
    );
  });

  // `stretch` у Fabric по умолчанию, поэтому в разобранных props его нет
  it('leaves stretch out of the parsed props', () => {
    expect(
      imageProps({ resizeMode: 'stretch', source: SOURCE }).resizeMode,
    ).toBe(undefined);
  });

  for (const mode of ['contain', 'repeat', 'center']) {
    it(`carries ${mode}`, () => {
      expect(imageProps({ resizeMode: mode, source: SOURCE }).resizeMode).toBe(
        mode,
      );
    });
  }
});

report();

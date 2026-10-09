// Дефолты `Image.android.js`: `resizeMode` cover, приоритет `objectFit` > prop > style

import { registerImageBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

registerImageBehavior();

function payloadFor(
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(1);
  const node = createElement('RCTImageView', false, 'image');
  for (const [name, value] of Object.entries({
    src: 'https://a/1.png',
    ...props,
  }))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return committedPayloadOf(node) ?? {};
}

describe('Image on Android', () => {
  it('defaults resizeMode to cover', () => {
    expect(payloadFor({}).resizeMode).toBe('cover');
  });

  it('takes resizeMode from the prop, then the style, and objectFit beats both', () => {
    expect(payloadFor({ resizeMode: 'contain' }).resizeMode).toBe('contain');
    expect(payloadFor({ style: { resizeMode: 'center' } }).resizeMode).toBe(
      'center',
    );
    expect(
      payloadFor({
        resizeMode: 'contain',
        style: { objectFit: 'fill' },
      }).resizeMode,
    ).toBe('stretch');
  });
});

report();

// What the Angular image input bag keeps when it is narrowed into host props

import { describe, expect, it } from 'vitest';
import { PlatformColor } from '@symbiote-native/engine';
import { resolveImageProps } from './image-shared';

describe('resolveImageProps', () => {
  it('keeps resizeMode none, RN lets an image skip resizing', () => {
    const props = resolveImageProps({ resizeMode: 'none' });

    expect(props.resizeMode).toBe('none');
  });

  it('forwards resizeMultiplier to the host', () => {
    const props = resolveImageProps({ resizeMultiplier: 2 });

    expect(props.resizeMultiplier).toBe(2);
  });

  it('keeps a PlatformColor tintColor, RN types it ColorValue', () => {
    const tint = PlatformColor('label');

    const props = resolveImageProps({ tintColor: tint });

    expect(props.tintColor).toEqual(tint);
  });

  it('drops a resizeMode RN does not know', () => {
    const props = resolveImageProps({ resizeMode: 'zoom' });

    expect(props.resizeMode).toBe(undefined);
  });
});

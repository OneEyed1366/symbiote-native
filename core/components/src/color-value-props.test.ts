// RN types these props `ColorValue`, so a `PlatformColor` must type-check next to a string

import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IColorValue, IOpaqueColorValue } from '@symbiote-native/engine';
import type { IButtonProps } from './view/render-button';
import type { IInputAccessoryViewViewProps } from './view/render-input-accessory-view';
import type { IModalViewProps } from './view/render-modal';
import type { ISwitchProps } from './view/render-switch';
import type { ITouchableHighlightUnderlayView } from './view/render-touchable-highlight';

describe('colour props accept any ColorValue', () => {
  it('takes a PlatformColor where RN does', () => {
    expectTypeOf<IOpaqueColorValue>().toExtend<
      NonNullable<ISwitchProps['thumbColor']>
    >();
    expectTypeOf<IOpaqueColorValue>().toExtend<
      NonNullable<ISwitchProps['ios_backgroundColor']>
    >();
    expectTypeOf<IOpaqueColorValue>().toExtend<
      NonNullable<IButtonProps['color']>
    >();
    expectTypeOf<IOpaqueColorValue>().toExtend<
      NonNullable<IModalViewProps['backdropColor']>
    >();
    expectTypeOf<IOpaqueColorValue>().toExtend<
      NonNullable<ITouchableHighlightUnderlayView['underlayColor']>
    >();
    expectTypeOf<IOpaqueColorValue>().toExtend<
      NonNullable<IInputAccessoryViewViewProps['backgroundColor']>
    >();
    expectTypeOf<
      NonNullable<ISwitchProps['thumbColor']>
    >().toEqualTypeOf<IColorValue>();
    expect(true).toBe(true);
  });
});

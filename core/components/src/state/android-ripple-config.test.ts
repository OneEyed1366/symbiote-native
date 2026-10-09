// Тип `android_ripple` и фабрики Ripple по RN 0.86 (#56395): PlatformColor и `alpha`
// Тесты исключены из `tsc --build`, поэтому тип проверяется отдельным прогоном `tsc` по этому файлу

import { describe, expect, expectTypeOf, it } from 'vitest';
import { PlatformColor, type IColorValue } from '@symbiote-native/engine';
import { rippleBackground } from '../view/render-touchable-native-feedback';
import type { IPressableAndroidRippleConfig } from './pressable';

const ACCENT = PlatformColor('?attr/colorAccent');

describe('android_ripple config', () => {
  it('takes any colour value RN takes, a PlatformColor among them', () => {
    expectTypeOf<IPressableAndroidRippleConfig['color']>().toEqualTypeOf<
      IColorValue | undefined
    >();
    const config: IPressableAndroidRippleConfig = { color: ACCENT };
    expect(config.color).toBe(ACCENT);
  });

  it('takes the ripple alpha', () => {
    const config: IPressableAndroidRippleConfig = { alpha: 0.5 };
    expect(config.alpha).toBe(0.5);
  });
});

describe('TouchableNativeFeedback.Ripple factory', () => {
  it('keeps a PlatformColor as given, native resolves it', () => {
    const background = rippleBackground(ACCENT, false);
    expect(background.color).toBe(ACCENT);
  });
});

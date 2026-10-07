import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defineExpoNativeView,
  defineExpoNativeViews,
} from './expo-native-view-handle';

beforeEach(() => {
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('defineExpoNativeView (Positive)', () => {
  it('names the view after the module and the view', () => {
    const view = defineExpoNativeView(vi.fn(), 'ExpoBlur', 'ExpoBlurView');

    expect(view.name()).toBe('ViewManagerAdapter_ExpoBlur_ExpoBlurView');
  });

  it('names a module with a single view after the module alone', () => {
    const view = defineExpoNativeView(vi.fn(), 'ExpoLinearGradient');

    expect(view.name()).toBe('ViewManagerAdapter_ExpoLinearGradient');
  });

  it('registers through the given requireNativeViewManager with module and view', () => {
    const requireManager = vi.fn();

    const registered = defineExpoNativeView(
      requireManager,
      'ExpoBlur',
      'ExpoBlurView',
    ).ensureRegistered();

    expect(registered).toBe(true);
    expect(requireManager).toHaveBeenCalledWith('ExpoBlur', 'ExpoBlurView');
  });
});

describe('defineExpoNativeViews', () => {
  it('builds one handle per view of the module under the keys it was given', () => {
    const requireManager = vi.fn();

    const views = defineExpoNativeViews(requireManager, 'ExpoBlur', {
      blur: 'ExpoBlurView',
      target: 'ExpoBlurTargetView',
    });

    expect(views.blur.name()).toBe('ViewManagerAdapter_ExpoBlur_ExpoBlurView');
    expect(views.target.name()).toBe(
      'ViewManagerAdapter_ExpoBlur_ExpoBlurTargetView',
    );
    views.target.ensureRegistered();
    expect(requireManager).toHaveBeenCalledWith(
      'ExpoBlur',
      'ExpoBlurTargetView',
    );
  });
});

describe('defineExpoNativeView (Negative)', () => {
  it('reports false when registration throws instead of crashing the render', () => {
    const view = defineExpoNativeView(() => {
      throw new Error('no view config');
    }, 'ExpoBlur');

    expect(view.ensureRegistered()).toBe(false);
  });
});

// Co-located Vue-driven test (ADR 0025) for useHideAnimation. react-native-bootsplash's
// TurboModule is faked (both its public JS API and the RNBootSplash native constants
// module HideAnimationController/computeHideAnimationStyles reach through), so no real
// native call fires. Proves the composable wires the framework-agnostic core's readiness
// gate + style computation onto Vue's own reactivity: a getter-driven `ready` ref reactively
// re-runs the watchEffect, hide() fires exactly once, and the returned computed reflects the
// core's container/logo/brand shapes faithfully — including the "no logo" skip case.
//
// Two failure groups, split by whether the failure is recoverable. Degraded is the Vue half of a
// contract core/ owns: a rejected native hide() must not leave the app buried under a splash it
// can no longer dismiss, so it fails open and reports through `config.onError`. Negative is the
// other half: a MISSING RNBootSplash is a build error, getHideAnimationConstants() is deliberately
// unguarded, and the throw propagates straight out of this composable's setup body. The
// React/Angular/Svelte sibling files prove both through their own lifecycles.

import {
  effectScope,
  nextTick,
  ref,
  type EffectScope,
  type Ref,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hide } from 'react-native-bootsplash';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import { useHideAnimation } from './index';
import type {
  IHideAnimationConfig,
  IHideAnimationFailure,
  IManifest,
} from '../../../core';

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

const FAKE_NATIVE_MODULE = {
  getConstants: vi.fn(() => ({ darkModeEnabled: false })),
  hide: vi.fn(() => Promise.resolve()),
  isVisible: () => true,
};

const registeredNativeModules: Record<string, unknown> = {
  RNBootSplash: FAKE_NATIVE_MODULE,
};

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

beforeEach(() => {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredNativeModules[name];
    return isPresent<T>(module) ? module : null;
  };
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  vi.clearAllMocks();
});

const MANIFEST: IManifest = {
  background: '#ffffff',
  logo: { width: 100, height: 100 },
  brand: { bottom: 40, width: 80, height: 20 },
};

// container.style is IStyleProp<IViewStyle> (union with the falsy/array style-composition
// shapes), but computeHideAnimationStyles always hands back a plain object here — narrow it
// once so the assertions can read .backgroundColor without an `as` cast.
function isPlainViewStyle(style: IStyleProp<IViewStyle>): style is IViewStyle {
  return typeof style === 'object' && style !== null && !Array.isArray(style);
}

function asViewStyle(style: IStyleProp<IViewStyle>): IViewStyle {
  if (!isPlainViewStyle(style)) {
    throw new Error('expected a plain view-style object');
  }
  return style;
}

function runInScope<T>(fn: () => T): { value: T; stop: () => void } {
  const scope: EffectScope = effectScope();
  const value = scope.run(fn);
  if (value === undefined) {
    throw new Error('effectScope.run() returned undefined');
  }
  return { value, stop: () => scope.stop() };
}

describe('useHideAnimation (Vue)', () => {
  describe('Positive (readiness gate + style plumbing)', () => {
    it('fires hide exactly once, only after layout + logo load + ready all become true', async () => {
      // why: the splash must stay up until every readiness signal (native layout, the logo
      // image, and the app's own `ready`) has reported in — hiding early would flash
      // unstyled/unloaded content underneath. `ready` starts false here specifically to prove
      // watchEffect re-syncs the controller when a reactive ref it reads changes later, not
      // just at setup time.
      const readyRef: Ref<boolean> = ref(false);
      const animate = vi.fn();
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        logo: 1,
        animate,
        ready: readyRef.value,
      });

      const { value: result, stop } = runInScope(() =>
        useHideAnimation(getConfig),
      );

      expect(hide).not.toHaveBeenCalled();

      result.value.container.onLayout();
      expect(hide, 'layout alone must not hide').not.toHaveBeenCalled();

      expect(typeof result.value.logo.onLoadEnd).toBe('function');
      result.value.logo.onLoadEnd?.();
      expect(
        hide,
        'layout + logo alone must not hide (ready still false)',
      ).not.toHaveBeenCalled();

      readyRef.value = true;
      await nextTick();
      expect(hide).toHaveBeenCalledTimes(1);
      expect(hide).toHaveBeenCalledWith({ fade: false });

      stop();
    });

    it('does not fire hide again once it already fired', async () => {
      // why: HideAnimationController.animateHasBeenCalled must fail closed — a later config
      // change re-running watchEffect (ready toggled off then back on) must not replay the
      // fade-out animation.
      const readyRef: Ref<boolean> = ref(true);
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        logo: 1,
        animate: vi.fn(),
        ready: readyRef.value,
      });

      const { value: result, stop } = runInScope(() =>
        useHideAnimation(getConfig),
      );

      result.value.container.onLayout();
      result.value.logo.onLoadEnd?.();
      await nextTick();
      expect(hide).toHaveBeenCalledTimes(1);

      // Toggling ready off and back on must not re-run the already-fired animation.
      readyRef.value = false;
      await nextTick();
      readyRef.value = true;
      await nextTick();
      expect(hide).toHaveBeenCalledTimes(1);

      stop();
    });

    it('returns the container/logo/brand shapes for a config with both logo and brand', () => {
      // why: the composable must hand the app the same container/logo/brand prop bags
      // react-native-bootsplash's own hook produces, so an app can bind them straight onto
      // View/Image without any adapter-specific shape.
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        logo: 1,
        brand: 2,
        animate: vi.fn(),
        ready: true,
      });

      const { value: result, stop } = runInScope(() =>
        useHideAnimation(getConfig),
      );
      const { container, logo, brand } = result.value;

      expect(asViewStyle(container.style).backgroundColor).toBe('#ffffff');
      expect(typeof container.onLayout).toBe('function');

      expect(logo.source).toBe(1);
      expect(logo.style).toEqual({ width: 100, height: 100 });
      expect(typeof logo.onLoadEnd).toBe('function');

      expect(brand.source).toBe(2);
      expect(brand.style).toEqual({
        position: 'absolute',
        bottom: 40,
        width: 80,
        height: 20,
      });
      expect(typeof brand.onLoadEnd).toBe('function');

      stop();
    });

    it('skips the logo and brand (source -1, no onLoadEnd) when config omits both sources', () => {
      // why: a splash with no logo/brand asset configured must not wait on an onLoadEnd that
      // will never fire — the sentinel source lets the app skip rendering the Image entirely.
      // MANIFEST here still carries a `brand` block (bottom/width/height), so this exercises
      // skipBrand's `config.brand == null` branch specifically — distinct from a manifest that
      // never declares `brand` at all (covered by the Angular/React sibling test files).
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        animate: vi.fn(),
        ready: true,
      });

      const { value: result, stop } = runInScope(() =>
        useHideAnimation(getConfig),
      );
      const { logo, brand } = result.value;

      expect(logo.source).toBe(-1);
      expect('onLoadEnd' in logo).toBe(false);
      expect(brand.source).toBe(-1);
      expect('onLoadEnd' in brand).toBe(false);

      stop();
    });

    it('reads darkModeEnabled from native constants and swaps in the dark logo/background', () => {
      // why: getHideAnimationConstants() is the ONLY source of darkModeEnabled — the
      // composable must thread it through to computeHideAnimationStyles so a dark-mode
      // device shows manifest.darkBackground / darkLogo instead of the light-mode assets.
      FAKE_NATIVE_MODULE.getConstants.mockReturnValueOnce({
        darkModeEnabled: true,
      });
      const getConfig = (): IHideAnimationConfig => ({
        manifest: { ...MANIFEST, darkBackground: '#000000' },
        logo: 1,
        darkLogo: 2,
        animate: vi.fn(),
        ready: true,
      });

      const { value: result, stop } = runInScope(() =>
        useHideAnimation(getConfig),
      );

      expect(asViewStyle(result.value.container.style).backgroundColor).toBe(
        '#000000',
      );
      expect(result.value.logo.source).toBe(2);

      stop();
    });

    it('reads the native constants exactly once, not on every recompute', () => {
      // why: getHideAnimationConstants() hits a native TurboModule call — the composable
      // reads it once in setup and closes over the result, rather than re-querying native
      // on every reactive recompute of the returned computed.
      const readyRef: Ref<boolean> = ref(false);
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        logo: 1,
        animate: vi.fn(),
        ready: readyRef.value,
      });

      const { value: result, stop } = runInScope(() =>
        useHideAnimation(getConfig),
      );

      // Force several recomputes of the returned computed.
      void result.value;
      readyRef.value = true;
      void result.value;
      readyRef.value = false;
      void result.value;

      expect(FAKE_NATIVE_MODULE.getConstants).toHaveBeenCalledTimes(1);

      stop();
    });
  });

  describe('Degraded (fail open, report loudly)', () => {
    it('still runs animate and reports the failure when hide() rejects', async () => {
      // why: animateHasBeenCalled is already true by the time hide() settles, so a swallowed
      // rejection shut the readiness gate for good — animate() never ran and the caller's splash
      // overlay stayed up over a dead app, with no retry path and nothing reported.
      const hideError = new Error('native hide failed');
      vi.mocked(hide).mockImplementationOnce(() => Promise.reject(hideError));

      const failures: IHideAnimationFailure[] = [];
      const animate = vi.fn();
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        animate,
        ready: true,
        onError: failure => failures.push(failure),
      });

      const { value: result, stop } = runInScope(() =>
        useHideAnimation(getConfig),
      );

      result.value.container.onLayout();
      await vi.waitFor(() => expect(animate).toHaveBeenCalledTimes(1));

      expect(failures).toEqual([{ stage: 'hide', error: hideError }]);

      stop();
    });
  });

  describe('Negative', () => {
    it('throws when the native RNBootSplash module is not registered', () => {
      // why: a missing RNBootSplash is a BUILD error, not a runtime condition — deterministic on
      // the first launch, and this repo's `npm install` wipes the `.rn-bootsplash/` folder the
      // podspec vendors at pod-install time, so a skipped `pod install` produces exactly it.
      // getHideAnimationConstants() is deliberately unguarded (upstream's own spec is a bare
      // TurboModuleRegistry.getEnforcing), and the composable calls it synchronously in setup, so
      // the caller sees the real error instead of a splash quietly stuck in light mode.
      delete registeredNativeModules.RNBootSplash;
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        animate: vi.fn(),
        ready: true,
      });

      expect(() => runInScope(() => useHideAnimation(getConfig))).toThrow(
        /RNBootSplash/,
      );

      registeredNativeModules.RNBootSplash = FAKE_NATIVE_MODULE;
    });
  });
});

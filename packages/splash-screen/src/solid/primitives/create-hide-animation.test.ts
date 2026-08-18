// Co-located Solid-driven test (ADR 0025) for createHideAnimation, the Solid twin of
// react/hooks/use-hide-animation, vue/composables/use-hide-animation and
// svelte/runes/use-hide-animation. react-native-bootsplash's TurboModule is faked (both its
// public JS API and the RNBootSplash native constants module the core reaches through), so no
// real native call fires.
//
// Proves the primitive wires the framework-agnostic readiness gate + style computation onto
// Solid's own reactivity: a signal-driven `ready` accessor re-runs the effect, hide() fires
// exactly once, and the returned memo reflects the core's container/logo/brand shapes faithfully.
//
// Two failure groups, split by whether the failure is recoverable. Degraded is the Solid half of a
// contract core/ owns: a rejected native hide() must not leave the app buried under a splash it
// can no longer dismiss, so it fails open and reports through `config.onError`. Negative is the
// other half: a MISSING RNBootSplash is a build error, getHideAnimationConstants() is deliberately
// unguarded, and the throw propagates straight out of the primitive body.

import { createRoot, createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hide } from 'react-native-bootsplash';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import { createHideAnimation } from './create-hide-animation';
import type {
  IHideAnimationConfig,
  IHideAnimationFailure,
  IHideAnimationResult,
  IManifest,
} from '../../core';

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

// container.style is IStyleProp<IViewStyle> (a union with the falsy/array style-composition
// shapes), but computeHideAnimationStyles always hands back a plain object here — narrow it once
// so the assertions can read .backgroundColor without an `as` cast.
function isPlainViewStyle(style: IStyleProp<IViewStyle>): style is IViewStyle {
  return typeof style === 'object' && style !== null && !Array.isArray(style);
}

function asViewStyle(style: IStyleProp<IViewStyle>): IViewStyle {
  if (!isPlainViewStyle(style)) {
    throw new Error('expected a plain view-style object');
  }
  return style;
}

// The primitive's effect is created inside the root, so it is deferred to the end of that
// `runUpdates` — build inside, assert outside, the same ordering a component gets. Later signal
// writes flush their effects synchronously, so no tick helper is needed after one.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createHideAnimation (Solid)', () => {
  describe('Positive (readiness gate + style plumbing)', () => {
    it('fires hide exactly once, only after layout + logo load + ready all become true', () => {
      // why: the splash must stay up until every readiness signal (native layout, the logo image,
      // and the app's own `ready`) has reported in — hiding early would flash unstyled content
      // underneath. `ready` starts false to prove the effect re-syncs the controller when a signal
      // the accessor reads changes later, not just at creation time.
      const [isReady, setIsReady] = createSignal(false);
      const animate = vi.fn();
      const { value: result, dispose } = inRoot<Accessor<IHideAnimationResult>>(
        () =>
          createHideAnimation(() => ({
            manifest: MANIFEST,
            logo: 1,
            animate,
            ready: isReady(),
          })),
      );
      disposeRoot = dispose;

      expect(hide).not.toHaveBeenCalled();

      result().container.onLayout();
      expect(hide, 'layout alone must not hide').not.toHaveBeenCalled();

      expect(typeof result().logo.onLoadEnd).toBe('function');
      result().logo.onLoadEnd?.();
      expect(
        hide,
        'layout + logo alone must not hide (ready still false)',
      ).not.toHaveBeenCalled();

      setIsReady(true);
      expect(hide).toHaveBeenCalledTimes(1);
      expect(hide).toHaveBeenCalledWith({ fade: false });
    });

    it('does not fire hide again once it already fired', () => {
      // why: HideAnimationController.animateHasBeenCalled must fail closed — a later config change
      // re-running the effect (ready toggled off then back on) must not replay the fade-out.
      const [isReady, setIsReady] = createSignal(true);
      const { value: result, dispose } = inRoot(() =>
        createHideAnimation(() => ({
          manifest: MANIFEST,
          logo: 1,
          animate: vi.fn(),
          ready: isReady(),
        })),
      );
      disposeRoot = dispose;

      result().container.onLayout();
      result().logo.onLoadEnd?.();
      expect(hide).toHaveBeenCalledTimes(1);

      setIsReady(false);
      setIsReady(true);

      expect(hide).toHaveBeenCalledTimes(1);
    });

    it('returns the container/logo/brand shapes for a config with both logo and brand', () => {
      // why: the primitive must hand the app the same container/logo/brand prop bags
      // react-native-bootsplash's own hook produces, so an app can bind them straight onto
      // View/Image without any adapter-specific shape.
      const { value: result, dispose } = inRoot(() =>
        createHideAnimation(() => ({
          manifest: MANIFEST,
          logo: 1,
          brand: 2,
          animate: vi.fn(),
          ready: true,
        })),
      );
      disposeRoot = dispose;
      const { container, logo, brand } = result();

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
    });

    it('skips the logo and brand (source -1, no onLoadEnd) when config omits both sources', () => {
      // why: a splash with no logo/brand asset configured must not wait on an onLoadEnd that will
      // never fire — the sentinel source lets the app skip rendering the Image entirely. MANIFEST
      // here still carries a `brand` block, so this exercises skipBrand's `config.brand == null`
      // branch specifically, distinct from a manifest that never declares `brand` at all.
      const { value: result, dispose } = inRoot(() =>
        createHideAnimation(() => ({
          manifest: MANIFEST,
          animate: vi.fn(),
          ready: true,
        })),
      );
      disposeRoot = dispose;
      const { logo, brand } = result();

      expect(logo.source).toBe(-1);
      expect('onLoadEnd' in logo).toBe(false);
      expect(brand.source).toBe(-1);
      expect('onLoadEnd' in brand).toBe(false);
    });

    it('reads darkModeEnabled from native constants and swaps in the dark logo/background', () => {
      // why: getHideAnimationConstants() is the ONLY source of darkModeEnabled — the primitive
      // must thread it through to computeHideAnimationStyles so a dark-mode device shows
      // manifest.darkBackground / darkLogo instead of the light-mode assets.
      FAKE_NATIVE_MODULE.getConstants.mockReturnValueOnce({
        darkModeEnabled: true,
      });
      const { value: result, dispose } = inRoot(() =>
        createHideAnimation(() => ({
          manifest: { ...MANIFEST, darkBackground: '#000000' },
          logo: 1,
          darkLogo: 2,
          animate: vi.fn(),
          ready: true,
        })),
      );
      disposeRoot = dispose;

      expect(asViewStyle(result().container.style).backgroundColor).toBe(
        '#000000',
      );
      expect(result().logo.source).toBe(2);
    });

    it('reads the native constants exactly once, not on every recompute', () => {
      // why: getHideAnimationConstants() hits a native TurboModule call — the primitive reads it
      // once in the controller's constructor and closes over the result, rather than re-querying
      // native on every recompute of the returned memo.
      const [isReady, setIsReady] = createSignal(false);
      const { value: result, dispose } = inRoot(() =>
        createHideAnimation(() => ({
          manifest: MANIFEST,
          logo: 1,
          animate: vi.fn(),
          ready: isReady(),
        })),
      );
      disposeRoot = dispose;

      // Force several recomputes of the returned memo.
      void result();
      setIsReady(true);
      void result();
      setIsReady(false);
      void result();

      expect(FAKE_NATIVE_MODULE.getConstants).toHaveBeenCalledTimes(1);
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
      const { value: result, dispose } = inRoot(() =>
        createHideAnimation(() => ({
          manifest: MANIFEST,
          animate,
          ready: true,
          onError: (failure: IHideAnimationFailure) => failures.push(failure),
        })),
      );
      disposeRoot = dispose;

      result().container.onLayout();
      await vi.waitFor(() => expect(animate).toHaveBeenCalledTimes(1));

      expect(failures).toEqual([{ stage: 'hide', error: hideError }]);
    });
  });

  describe('Negative', () => {
    it('throws when the native RNBootSplash module is not registered', () => {
      // why: a missing RNBootSplash is a BUILD error, not a runtime condition — deterministic on
      // the first launch, and this repo's `npm install` wipes the `.rn-bootsplash/` folder the
      // podspec vendors at pod-install time, so a skipped `pod install` produces exactly it.
      // getHideAnimationConstants() is deliberately unguarded and the primitive calls it
      // synchronously in its body, so the caller sees the real error instead of a splash quietly
      // stuck in light mode.
      delete registeredNativeModules.RNBootSplash;
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        animate: vi.fn(),
        ready: true,
      });

      expect(() => inRoot(() => createHideAnimation(getConfig))).toThrow(
        /RNBootSplash/,
      );

      registeredNativeModules.RNBootSplash = FAKE_NATIVE_MODULE;
    });
  });
});

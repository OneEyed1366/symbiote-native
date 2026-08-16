// Co-located Angular-driven test (ADR 0025) for HideAnimationService. Mounts a real host
// component through @symbiote-native/angular so `connect()` runs the same way an app would call
// it — inside the component's own injection context — and drives the returned signal through a
// full mount/unmount lifecycle rather than poking the service in isolation.
//
// Two failure groups, split by whether the failure is recoverable. Degraded is the Angular half of
// a contract core/ owns: a rejected native hide() must not leave the app buried under a splash it
// can no longer dismiss, so it fails open and reports through `config.onError`. Negative is the
// other half: a MISSING RNBootSplash is a build error, getHideAnimationConstants() is deliberately
// unguarded, and the throw aborts the host component's construction. The React/Vue/Svelte sibling
// files prove both through their own lifecycles.

import '@angular/compiler';
import { Component, inject, signal, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { flattenStyle } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import type { IImageSourceProp } from '@symbiote-native/components';
import { hide as mockedHide } from 'react-native-bootsplash';
import type { IHideAnimationFailure, IHideAnimationResult } from '../../../core';
import { HideAnimationService } from './index';

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const FAKE_NATIVE_MODULE = {
  getConstants: vi.fn(() => ({ darkModeEnabled: false })),
  hide: vi.fn(() => Promise.resolve()),
  isVisible: () => true,
};

const registeredNativeModules: Record<string, unknown> = { RNBootSplash: FAKE_NATIVE_MODULE };

const ROOT_TAG = 940;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
};

const MANIFEST = {
  background: '#ffffff',
  darkBackground: '#000000',
  logo: { width: 100, height: 100 },
  brand: { bottom: 40, width: 80, height: 20 },
};

const LOGO_SOURCE: IImageSourceProp = { uri: 'logo.png' };
const BRAND_SOURCE: IImageSourceProp = { uri: 'brand.png' };
const DARK_LOGO_SOURCE: IImageSourceProp = { uri: 'dark-logo.png' };
const DARK_BRAND_SOURCE: IImageSourceProp = { uri: 'dark-brand.png' };

let capturedResult: Signal<IHideAnimationResult> | undefined;
let capturedAnimate: ReturnType<typeof vi.fn> | undefined;
let capturedReady: ReturnType<typeof signal<boolean>> | undefined;
const capturedFailures: IHideAnimationFailure[] = [];

@Component({
  selector: 'symbiote-hide-animation-host',
  standalone: true,
  template: '',
})
class HideAnimationHost {
  readonly ready = signal(true);
  readonly animate = vi.fn();

  readonly hideAnimation = inject(HideAnimationService).connect(() => ({
    manifest: MANIFEST,
    ready: this.ready(),
    logo: LOGO_SOURCE,
    brand: BRAND_SOURCE,
    animate: this.animate,
  }));

  constructor() {
    capturedResult = this.hideAnimation;
    capturedAnimate = this.animate;
    capturedReady = this.ready;
  }
}

@Component({
  selector: 'symbiote-hide-animation-no-logo-host',
  standalone: true,
  template: '',
})
class HideAnimationNoLogoHost {
  readonly animate = vi.fn();

  readonly hideAnimation = inject(HideAnimationService).connect(() => ({
    manifest: MANIFEST,
    logo: undefined,
    brand: undefined,
    animate: this.animate,
  }));

  constructor() {
    capturedResult = this.hideAnimation;
    capturedAnimate = this.animate;
  }
}

@Component({
  selector: 'symbiote-hide-animation-ready-gate-host',
  standalone: true,
  template: '',
})
class HideAnimationReadyGateHost {
  readonly ready = signal(false);
  readonly animate = vi.fn();

  readonly hideAnimation = inject(HideAnimationService).connect(() => ({
    manifest: MANIFEST,
    ready: this.ready(),
    logo: LOGO_SOURCE,
    brand: BRAND_SOURCE,
    animate: this.animate,
  }));

  constructor() {
    capturedResult = this.hideAnimation;
    capturedAnimate = this.animate;
    capturedReady = this.ready;
  }
}

@Component({
  selector: 'symbiote-hide-animation-dark-mode-host',
  standalone: true,
  template: '',
})
class HideAnimationDarkModeHost {
  readonly animate = vi.fn();

  readonly hideAnimation = inject(HideAnimationService).connect(() => ({
    manifest: MANIFEST,
    logo: LOGO_SOURCE,
    darkLogo: DARK_LOGO_SOURCE,
    brand: BRAND_SOURCE,
    darkBrand: DARK_BRAND_SOURCE,
    animate: this.animate,
  }));

  constructor() {
    capturedResult = this.hideAnimation;
    capturedAnimate = this.animate;
  }
}

// Wires onError so the Degraded group can read what core reported; every other host leaves it
// unset, which is also the shape a caller that never opts in gets.
@Component({
  selector: 'symbiote-hide-animation-failure-host',
  standalone: true,
  template: '',
})
class HideAnimationFailureHost {
  readonly animate = vi.fn();

  readonly hideAnimation = inject(HideAnimationService).connect(() => ({
    manifest: MANIFEST,
    ready: true,
    logo: LOGO_SOURCE,
    darkLogo: DARK_LOGO_SOURCE,
    animate: this.animate,
    onError: (failure: IHideAnimationFailure) => capturedFailures.push(failure),
  }));

  constructor() {
    capturedResult = this.hideAnimation;
    capturedAnimate = this.animate;
  }
}

beforeEach(() => {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredNativeModules[name];
    return isPresent<T>(module) ? module : null;
  };
  registeredNativeModules.RNBootSplash = FAKE_NATIVE_MODULE;
  capturedResult = undefined;
  capturedAnimate = undefined;
  capturedReady = undefined;
  capturedFailures.length = 0;
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  globalThis.__turboModuleProxy = undefined;
  vi.clearAllMocks();
});

describe('HideAnimationService.connect', () => {
  describe('Positive (readiness gate + style plumbing)', () => {
    it('reports the container/logo/brand shapes for a config with both logo and brand', async () => {
      // why: connect()'s computed() must hand the app the same container/logo/brand prop
      // bags react-native-bootsplash's own hook produces, so an app can bind them straight
      // onto View/Image without any adapter-specific shape.
      mount(ROOT_TAG, HideAnimationHost);
      await settle();

      const result = capturedResult?.();
      if (result === undefined) throw new Error('hideAnimation signal was not captured');

      expect(flattenStyle(result.container.style).backgroundColor).toBe(MANIFEST.background);
      expect(result.container.onLayout).toBeTypeOf('function');

      expect(result.logo.source).toBe(LOGO_SOURCE);
      expect(flattenStyle(result.logo.style)).toEqual({
        width: MANIFEST.logo.width,
        height: MANIFEST.logo.height,
      });
      expect(result.logo.onLoadEnd).toBeTypeOf('function');

      expect(result.brand.source).toBe(BRAND_SOURCE);
      expect(flattenStyle(result.brand.style)).toMatchObject({
        bottom: MANIFEST.brand.bottom,
        width: MANIFEST.brand.width,
        height: MANIFEST.brand.height,
      });
      expect(result.brand.onLoadEnd).toBeTypeOf('function');
    });

    it('fires hide() exactly once, only after layout + logo + brand + ready are all satisfied', async () => {
      // why: the splash must stay up until every readiness signal (native layout, both
      // images, and the app's own `ready`) has reported in — hiding early would flash
      // unstyled/unloaded content underneath.
      mount(ROOT_TAG, HideAnimationHost);
      await settle();

      const result = capturedResult;
      if (result === undefined || capturedAnimate === undefined) {
        throw new Error('hideAnimation signal was not captured');
      }

      result().container.onLayout();
      expect(mockedHide).not.toHaveBeenCalled();

      result().logo.onLoadEnd?.();
      expect(mockedHide).not.toHaveBeenCalled();

      // Brand is the last gate: only once it reports load-end does hide() fire.
      result().brand.onLoadEnd?.();
      await settle();

      expect(mockedHide).toHaveBeenCalledOnce();
      expect(mockedHide).toHaveBeenCalledWith({ fade: false });
      expect(capturedAnimate).toHaveBeenCalledOnce();
    });

    it('does not fire hide() again after it has already fired', async () => {
      // why: HideAnimationController.animateHasBeenCalled must fail closed — a later
      // config change re-running the effect (ready toggled off then back on) must not
      // replay the fade-out animation.
      mount(ROOT_TAG, HideAnimationHost);
      await settle();

      const result = capturedResult;
      if (result === undefined || capturedReady === undefined) {
        throw new Error('hideAnimation signal was not captured');
      }

      result().container.onLayout();
      result().logo.onLoadEnd?.();
      result().brand.onLoadEnd?.();
      await settle();
      expect(mockedHide).toHaveBeenCalledOnce();

      capturedReady.set(false);
      await settle();
      capturedReady.set(true);
      await settle();

      expect(mockedHide).toHaveBeenCalledOnce();
    });

    it('reports source -1 and no onLoadEnd when config.logo is omitted', async () => {
      // why: a splash with no logo asset configured must not wait on an onLoadEnd that
      // will never fire — the sentinel source lets the app skip rendering the Image
      // entirely (mirrors react-native-bootsplash's own -1 convention).
      mount(ROOT_TAG, HideAnimationNoLogoHost);
      await settle();

      const result = capturedResult?.();
      if (result === undefined) throw new Error('hideAnimation signal was not captured');

      expect(result.logo.source).toBe(-1);
      expect(result.logo.onLoadEnd).toBeUndefined();
      expect(result.brand.source).toBe(-1);
      expect(result.brand.onLoadEnd).toBeUndefined();
    });

    it('holds hide() back while ready starts false, then fires once ready flips true', async () => {
      // why: connect()'s effect re-runs updateConfig on every reactive read of getConfig(),
      // specifically so a `ready` signal that starts false (app still loading its own data
      // at boot) unlocks hide() the moment it flips true — not just a ready:true value
      // captured once at construction.
      mount(ROOT_TAG, HideAnimationReadyGateHost);
      await settle();

      const result = capturedResult;
      if (result === undefined || capturedReady === undefined) {
        throw new Error('hideAnimation signal was not captured');
      }

      result().container.onLayout();
      result().logo.onLoadEnd?.();
      result().brand.onLoadEnd?.();
      await settle();
      expect(mockedHide, 'ready is still false').not.toHaveBeenCalled();

      capturedReady.set(true);
      await settle();

      expect(mockedHide).toHaveBeenCalledOnce();
      expect(mockedHide).toHaveBeenCalledWith({ fade: false });
    });

    it('reads darkModeEnabled from native constants and swaps in the dark logo/brand/background', async () => {
      // why: getHideAnimationConstants() is the ONLY source of darkModeEnabled — connect()
      // must thread it through to computeHideAnimationStyles so a dark-mode device shows
      // manifest.darkBackground / darkLogo / darkBrand instead of the light-mode assets.
      registeredNativeModules.RNBootSplash = {
        ...FAKE_NATIVE_MODULE,
        getConstants: () => ({ darkModeEnabled: true }),
      };

      mount(ROOT_TAG, HideAnimationDarkModeHost);
      await settle();

      const result = capturedResult?.();
      if (result === undefined) throw new Error('hideAnimation signal was not captured');

      expect(flattenStyle(result.container.style).backgroundColor).toBe(MANIFEST.darkBackground);
      expect(result.logo.source).toBe(DARK_LOGO_SOURCE);
      expect(result.brand.source).toBe(DARK_BRAND_SOURCE);
    });

    it('reads native constants exactly once per connect(), not on every recompute', async () => {
      // why: getHideAnimationConstants() hits a native TurboModule call — connect() reads
      // it once and closes over the result, matching the Vue composable's identical
      // one-time-capture contract, rather than re-querying native on every signal read.
      mount(ROOT_TAG, HideAnimationHost);
      await settle();

      const result = capturedResult;
      if (result === undefined || capturedReady === undefined) {
        throw new Error('hideAnimation signal was not captured');
      }

      void result();
      capturedReady.set(false);
      await settle();
      void result();
      capturedReady.set(true);
      await settle();
      void result();

      expect(FAKE_NATIVE_MODULE.getConstants).toHaveBeenCalledTimes(1);
    });
  });

  describe('Degraded (fail open, report loudly)', () => {
    it('still runs animate and reports the failure when hide() rejects', async () => {
      // why: animateHasBeenCalled is already true by the time hide() settles, so a swallowed
      // rejection shut the readiness gate for good — animate() never ran, no later layout event
      // could retry, and the app stayed buried under an overlay that never faded out.
      const hideError = new Error('native hide failed');
      vi.mocked(mockedHide).mockImplementationOnce(() => Promise.reject(hideError));

      mount(ROOT_TAG, HideAnimationFailureHost);
      await settle();

      const result = capturedResult;
      if (result === undefined || capturedAnimate === undefined) {
        throw new Error('hideAnimation signal was not captured');
      }

      result().container.onLayout();
      result().logo.onLoadEnd?.();
      await settle();

      expect(capturedAnimate).toHaveBeenCalledOnce();
      expect(capturedFailures).toEqual([{ stage: 'hide', error: hideError }]);
    });
  });

  describe('Negative', () => {
    it('throws when the native RNBootSplash module is not registered', () => {
      // why: a missing RNBootSplash is a BUILD error, not a runtime condition — deterministic on
      // the first launch, and this repo's `npm install` wipes the `.rn-bootsplash/` folder the
      // podspec vendors at pod-install time, so a skipped `pod install` produces exactly it.
      // getHideAnimationConstants() is deliberately unguarded (upstream's own spec is a bare
      // TurboModuleRegistry.getEnforcing), and connect() calls it synchronously in its own body,
      // so a host component built without the native module fails loudly at mount rather than
      // running on a splash quietly stuck in light mode.
      registeredNativeModules.RNBootSplash = undefined;

      expect(() => mount(ROOT_TAG, HideAnimationNoLogoHost)).toThrow(/RNBootSplash/);
    });
  });
});

// Co-located Svelte-driven test (ADR 0025) for useHideAnimation, the Svelte twin of
// react/hooks/use-hide-animation and vue/composables/use-hide-animation. react-native-bootsplash
// is mocked (both its public JS API and the RNBootSplash native-constants TurboModule), so no
// real native call fires. Runs the rune inside a REAL compiled .svelte component — same
// compile-then-dynamic-import pattern as adapters/svelte/src/host-instance.test.ts — because
// $state/$effect require a real component context, unlike Vue's composable which can run
// under a bare effectScope().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type {
  IHideAnimationConfig,
  IHideAnimationFailure,
  IHideAnimationResult,
  IManifest,
} from '../../core';
// The real Metro pipeline's own .svelte.ts compile step (strips TS via ts.transpileModule, then
// desugars runes via compileModule) — reused here instead of duplicated, so this test exercises
// the actual shipped compile path, not a parallel implementation of it. Default-imported (like
// metro-svelte-transformer.test.ts) rather than named, since it's a .cjs module.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

const FAKE_NATIVE_MODULE = { getConstants: vi.fn(() => ({ darkModeEnabled: false })) };

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const ROOT_TAG = 91_502;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-hide-animation-probe.mjs');
const REACTIVE_PROBE_OUT = join(__dirname, '.smoke-compiled-use-hide-animation-reactive-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-hide-animation.svelte.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const MANIFEST: IManifest = { background: '#ffffff', logo: { width: 100, height: 100 } };

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'RNBootSplash' && isPresent<T>(FAKE_NATIVE_MODULE) ? FAKE_NATIVE_MODULE : null;
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(REACTIVE_PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
  globalThis.__turboModuleProxy = undefined;
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

// $state/$effect require Svelte's MODULE compiler, not the component compiler — a bare,
// uncompiled rune call throws `rune_outside_svelte` at runtime. vitest doesn't run the real
// Metro transformer, so this test drives its exact compileSvelteModuleFile step (TS-strip +
// compileModule) against the real rune source, exercising the actual shipped implementation.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-hide-animation.svelte.ts'), 'utf-8');
  const code = compileSvelteModuleFile(source, 'use-hide-animation.svelte.ts');
  writeFileSync(RUNE_OUT, code);
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useHideAnimation } from './.smoke-compiled-use-hide-animation.svelte.mjs';
       import type { IHideAnimationConfig, IHideAnimationResult } from '../../core';
       let { getConfig, onResult }: {
         getConfig: () => IHideAnimationConfig;
         onResult: (result: IHideAnimationResult) => void;
       } = $props();
       const animation = useHideAnimation(getConfig);
       $effect(() => { onResult(animation.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'HideAnimationProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('HideAnimationProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

// Owns `ready` as its OWN `$state`, unlike loadProbe()'s fixed getConfig closure — proves the
// source header's claim that `$effect` "re-syncs the controller's config on every reactive read
// inside getConfig()": here getConfig() reads a value that is genuinely reactive from the
// PROBE's perspective, so a later flip has to reach the rune's own effect and re-trigger
// controller.updateConfig(), the same way a caller's prop change would in a real app.
async function loadReactiveReadyProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useHideAnimation } from './.smoke-compiled-use-hide-animation.svelte.mjs';
       import type { IHideAnimationConfig, IHideAnimationResult } from '../../core';
       let { onResult, onControls }: {
         onResult: (result: IHideAnimationResult) => void;
         onControls: (controls: { setReady: (value: boolean) => void }) => void;
       } = $props();
       let ready = $state(false);
       const getConfig = (): IHideAnimationConfig => ({
         manifest: { background: '#ffffff', logo: { width: 100, height: 100 } },
         ready,
         animate: () => {},
       });
       const animation = useHideAnimation(getConfig);
       $effect(() => { onResult(animation.current); });
       onControls({ setReady: (value: boolean) => { ready = value; } });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'HideAnimationReactiveProbe.svelte' },
  );
  writeFileSync(REACTIVE_PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${REACTIVE_PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('HideAnimationReactiveProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

// Three groups. Positive is the readiness GATE (hide fires only once every required signal is in).
// Degraded is the recoverable half core/ refuses to let strand the app under a splash it can no
// longer dismiss — a rejected hide(), reported through `config.onError`. Negative is the
// unrecoverable half: a MISSING RNBootSplash is a build error, getHideAnimationConstants() is
// deliberately unguarded, and the throw escapes the component's script body.
describe('useHideAnimation (Svelte)', () => {
  describe('Positive (readiness gate, skip sentinels, idempotency, reactive re-sync)', () => {
    it('hides exactly once, only after layout + logo load-end both resolve', async () => {
      // why: HideAnimationController's readiness gate must AND every required signal — firing hide()
      // before the logo image has actually finished loading would flash an unloaded image the
      // instant the splash screen disappears.
      const { hide } = await import('react-native-bootsplash');
      let animateCalls = 0;
      const results: IHideAnimationResult[] = [];
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        logo: 1,
        ready: true,
        animate: () => {
          animateCalls += 1;
        },
      });

      const Probe = await loadProbe();
      mount(ROOT_TAG, Probe, {
        getConfig,
        onResult: (result: IHideAnimationResult) => results.push(result),
      });
      await tick();

      const last = results[results.length - 1];
      expect(hide).not.toHaveBeenCalled();

      last.container.onLayout();
      expect(hide, 'layout alone must not hide').not.toHaveBeenCalled();

      last.logo.onLoadEnd?.();
      expect(hide).toHaveBeenCalledTimes(1);
      expect(hide).toHaveBeenCalledWith({ fade: false });
      await vi.waitFor(() => expect(animateCalls).toBe(1));
    });

    it('does not hide again once already triggered', async () => {
      // why: `animateHasBeenCalled` is the guard against firing the native hide (and the caller's
      // fade-out animate()) more than once — a second layout event re-entering the readiness gate
      // must be a no-op, not a second dismiss animation stacking on top of the first.
      const { hide } = await import('react-native-bootsplash');
      const results: IHideAnimationResult[] = [];
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        ready: true,
        animate: () => {},
      });

      const Probe = await loadProbe();
      mount(ROOT_TAG, Probe, {
        getConfig,
        onResult: (result: IHideAnimationResult) => results.push(result),
      });
      await tick();

      const first = results[results.length - 1];
      first.container.onLayout();
      await vi.waitFor(() => expect(hide).toHaveBeenCalledTimes(1));

      const last = results[results.length - 1];
      last.container.onLayout();
      expect(hide).toHaveBeenCalledTimes(1);
    });

    it('reports the skip sentinel and no onLoadEnd when logo is omitted', async () => {
      // why: an app that ships no logo image must not be gated on a load-end event that will never
      // fire — computeHideAnimationStyles's SKIPPED_IMAGE_SOURCE (-1) is the documented sentinel the
      // caller's own Image binding checks for, and skipping onLoadEnd is what keeps logoReady true
      // from construction (HideAnimationController's own comment) instead of hanging forever.
      const results: IHideAnimationResult[] = [];
      const getConfig = (): IHideAnimationConfig => ({ manifest: MANIFEST, animate: () => {} });

      const Probe = await loadProbe();
      mount(ROOT_TAG, Probe, {
        getConfig,
        onResult: (result: IHideAnimationResult) => results.push(result),
      });
      await tick();

      const last = results[results.length - 1];
      expect(last.logo.source).toBe(-1);
      expect(last.logo.onLoadEnd).toBeUndefined();
    });

    it('gates hide on brand load-end too, when the manifest declares a brand', async () => {
      // why: brandReady follows the identical construction-time-capture rule as logoReady
      // (HideAnimationController's comment) — this closes the logical outcome the other tests never
      // touch, since MANIFEST in this file carries no `brand`. A caller that DOES supply a brand
      // image must have hide() wait on its onLoadEnd exactly like the logo's.
      const { hide } = await import('react-native-bootsplash');
      const manifestWithBrand: IManifest = {
        ...MANIFEST,
        brand: { bottom: 0, width: 10, height: 10 },
      };
      const results: IHideAnimationResult[] = [];
      const getConfig = (): IHideAnimationConfig => ({
        manifest: manifestWithBrand,
        brand: 2,
        ready: true,
        animate: () => {},
      });

      const Probe = await loadProbe();
      mount(ROOT_TAG, Probe, {
        getConfig,
        onResult: (result: IHideAnimationResult) => results.push(result),
      });
      await tick();

      const last = results[results.length - 1];
      last.container.onLayout();
      expect(hide, 'brand image has not finished loading yet').not.toHaveBeenCalled();

      last.brand.onLoadEnd?.();
      expect(hide).toHaveBeenCalledTimes(1);
    });

    it('re-syncs the controller from getConfig() on every reactive read, gating hide on userReady flipping true', async () => {
      // why: proves the source header's central claim — "$effect re-syncs the controller's config
      // on every reactive read inside getConfig()" — which none of the fixed-getConfig tests above
      // can exercise, since their closures never change after mount. Only a getConfig that reads a
      // genuinely reactive value (here the probe's own `$state`) can show the effect re-running and
      // controller.updateConfig() actually being reached a second time.
      const { hide } = await import('react-native-bootsplash');
      let controls: { setReady: (value: boolean) => void } | undefined;
      const results: IHideAnimationResult[] = [];

      const Probe = await loadReactiveReadyProbe();
      mount(ROOT_TAG, Probe, {
        onResult: (result: IHideAnimationResult) => results.push(result),
        onControls: (value: { setReady: (value: boolean) => void }) => {
          controls = value;
        },
      });
      await tick();
      if (controls === undefined) throw new Error('the reactive probe did not expose controls');

      results[results.length - 1].container.onLayout();
      expect(hide, 'userReady is still false').not.toHaveBeenCalled();

      controls.setReady(true);
      await tick();

      expect(hide).toHaveBeenCalledTimes(1);
    });
  });

  describe('Degraded (fail open, report loudly)', () => {
    it('still runs animate and reports the failure when hide() rejects', async () => {
      // why: the old `.catch(() => {})` read as an error boundary but was a trap —
      // animateHasBeenCalled is already true by the time hide() settles, so skipping animate()
      // left the caller's overlay up over a dead app with no readiness callback able to retry.
      // A rejected native hide (the OS already dismissed the splash, say) must cost the
      // animation's accuracy, never the app's usability.
      const { hide } = await import('react-native-bootsplash');
      const hideError = new Error('native hide failed');
      vi.mocked(hide).mockRejectedValueOnce(hideError);
      const failures: IHideAnimationFailure[] = [];
      let animateCalls = 0;
      const results: IHideAnimationResult[] = [];
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        ready: true,
        animate: () => {
          animateCalls += 1;
        },
        onError: (failure: IHideAnimationFailure) => failures.push(failure),
      });

      const Probe = await loadProbe();
      mount(ROOT_TAG, Probe, {
        getConfig,
        onResult: (result: IHideAnimationResult) => results.push(result),
      });
      await tick();

      results[results.length - 1].container.onLayout();
      await vi.waitFor(() => expect(animateCalls).toBe(1));

      expect(failures).toEqual([{ stage: 'hide', error: hideError }]);
    });

  });

  describe('Negative', () => {
    it('throws when the native RNBootSplash module is not registered', async () => {
      // why: a missing RNBootSplash is a BUILD error, not a runtime condition — deterministic on
      // the first launch, and this repo's `npm install` wipes the `.rn-bootsplash/` folder the
      // podspec vendors at pod-install time, so a skipped `pod install` produces exactly it.
      // getHideAnimationConstants() is deliberately unguarded (upstream's own spec is a bare
      // TurboModuleRegistry.getEnforcing), and the rune calls it in the component's script body,
      // so the mount fails loudly instead of running on a splash quietly stuck in light mode.
      globalThis.__turboModuleProxy = () => null;
      const results: IHideAnimationResult[] = [];
      const getConfig = (): IHideAnimationConfig => ({
        manifest: MANIFEST,
        ready: true,
        animate: () => {},
      });

      const Probe = await loadProbe();

      expect(() =>
        mount(ROOT_TAG, Probe, {
          getConfig,
          onResult: (result: IHideAnimationResult) => results.push(result),
        }),
      ).toThrow(/RNBootSplash/);

      expect(results, 'the rune must not hand back defaults it could not read').toHaveLength(0);
    });
  });
});

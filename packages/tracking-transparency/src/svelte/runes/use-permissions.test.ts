// Co-located Svelte-driven test (ADR 0025) for usePermissions, the Svelte twin of
// react/hooks/use-permissions and vue/composables/use-permissions. Runs the rune inside a REAL
// compiled .svelte component — same compile-then-dynamic-import pattern as
// packages/splash-screen/src/svelte/runes/use-hide-animation.test.ts — because $state/$effect
// require a real component context.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import { PermissionStatus, type PermissionResponse } from '../../core';
// The real Metro pipeline's own .svelte.ts compile step (TS-strip + compileModule), reused here so
// this test exercises the actual shipped compile path.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';
import type { usePermissions } from './use-permissions.svelte';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } =
  metroSvelteTransformer;

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } =
  vi.hoisted(() => ({
    getTrackingPermissionsAsync: vi.fn(),
    requestTrackingPermissionsAsync: vi.fn(),
  }));

// Same enum-shaped-object mock trick the Vue twin's test uses.
vi.mock('../../core', () => ({
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}));

const GRANTED: PermissionResponse = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
};
const DENIED: PermissionResponse = {
  status: PermissionStatus.DENIED,
  granted: false,
  canAskAgain: true,
  expires: 'never',
};

const ROOT_TAG = 91_640;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-permissions-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-permissions.svelte.mjs');

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  getTrackingPermissionsAsync.mockResolvedValue(GRANTED);
  requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

// $state/$effect require Svelte's MODULE compiler, not the component compiler — a bare,
// uncompiled rune call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(
    join(__dirname, 'use-permissions.svelte.ts'),
    'utf-8',
  );
  writeFileSync(
    RUNE_OUT,
    compileSvelteModuleFile(source, 'use-permissions.svelte.ts'),
  );
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { usePermissions } from './.smoke-compiled-use-permissions.svelte.mjs';
       let { onReady }: { onReady: (permissions: unknown) => void } = $props();
       onReady(usePermissions());
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'PermissionsProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('PermissionsProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

type IPermissions = ReturnType<typeof usePermissions>;

async function mountPermissions(): Promise<IPermissions> {
  const Probe = await loadProbe();
  let permissions: IPermissions | undefined;
  mount(ROOT_TAG, Probe, {
    onReady: (value: IPermissions) => {
      permissions = value;
    },
  });
  if (permissions === undefined) {
    throw new Error('the probe component body did not run');
  }
  return permissions;
}

// Node only reports an unhandled rejection a macrotask after the promise settles, so a plain
// `await` on the rune's own boxed state is too early to prove one did not happen. The mount
// itself has to run inside the window, hence the passed-through result.
async function collectUnhandledRejections<T>(
  run: () => Promise<T>,
): Promise<[T, unknown[]]> {
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    const result = await run();
    await new Promise(resolve => setTimeout(resolve, 0));
    return [result, unhandled];
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

// get()/request() have no guard clause of their own — they forward straight to the mocked core
// calls and write whatever those resolve with (core's own rejection contract is exercised by
// packages/tracking-transparency/src/core/tracking-transparency.test.ts, out of this rune's
// scope). The Positive group covers seed, auto-fetch-on-mount, and the two imperative actions
// keeping BOTH their return value and the reactive `status` in sync. The Negative group covers
// the one path that DOES catch: the mount fetch, which has no caller to reject to.
describe('usePermissions (Svelte)', () => {
  describe('Positive (seed, auto-fetch, request/get keep return value + reactive status in sync)', () => {
    it('starts at null before the initial fetch resolves', async () => {
      // why: the caller needs a distinguishable "don't know yet" state (null) instead of an
      // arbitrary default permission value while the one-shot mount fetch is in flight.
      const permissions = await mountPermissions();

      expect(permissions.status).toBe(null);
    });

    it('fetches the permission status exactly once on mount, with no request() call', async () => {
      // why: mirrors upstream's auto-fetch-on-mount contract (a Svelte twin of Vue's onMounted) —
      // reading current permission status must never itself trigger the OS prompt that
      // requestTrackingPermissionsAsync would show.
      const permissions = await mountPermissions();

      await vi.waitFor(() => expect(permissions.status).toEqual(GRANTED));
      expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(requestTrackingPermissionsAsync).not.toHaveBeenCalled();
    });

    it('request() resolves with the fresh response AND updates reactive status to the same value', async () => {
      // why: request() is documented as an imperative callback the caller can await directly
      // (`{ status, request, get }`, Vue's Ref-unwrap twin) — a caller relying on the resolved
      // value must see the exact same response the reactive `status` getter settles on, not two
      // independently-resolved results that could disagree.
      const permissions = await mountPermissions();
      await vi.waitFor(() => expect(permissions.status).toEqual(GRANTED));

      requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      const resolved = await permissions.request();

      expect(resolved).toEqual(DENIED);
      expect(permissions.status).toEqual(DENIED);
    });

    it('get() resolves with the fresh response AND updates reactive status to the same value', async () => {
      // why: same return-value/reactive-status agreement as request(), for the re-fetch path.
      const permissions = await mountPermissions();
      await vi.waitFor(() => expect(permissions.status).toEqual(GRANTED));

      getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      const resolved = await permissions.get();

      expect(resolved).toEqual(DENIED);
      expect(permissions.status).toEqual(DENIED);
    });
  });

  describe('Negative (the mount fetch has no caller to reject to)', () => {
    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: the $effect's fetch used to be `void get()`, so a native rejection escaped the rune
      // entirely as an unhandled promise rejection and left `status` at null — indistinguishable
      // from "still fetching".
      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );

      const [permissions, unhandled] =
        await collectUnhandledRejections(mountPermissions);

      await vi.waitFor(() =>
        expect(permissions.error?.message).toBe('native call failed'),
      );
      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(permissions.status).toBe(null);
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      const permissions = await mountPermissions();
      await vi.waitFor(() => expect(permissions.error).not.toBe(null));

      await permissions.get();

      expect(permissions.error).toBe(null);
      expect(permissions.status).toEqual(GRANTED);
    });
  });
});

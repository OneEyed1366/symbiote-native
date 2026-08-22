// Co-located Svelte-driven test (ADR 0025) for usePermissions, the Svelte twin of
// vue/composables/use-permissions' own test. Mocks the whole core module (never expo-modules-core
// internals) since this exercises rune mount lifecycle timing, not any native view. Runs the rune
// inside a REAL compiled .svelte component — same compile-then-dynamic-import pattern as
// packages/splash-screen/src/svelte/runes/use-hide-animation.test.ts — because $state/$effect
// require a real component context, unlike Vue's composable which can run under a bare
// effectScope().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
// The real Metro pipeline's own .svelte.ts compile step (TS-strip + compileModule), reused here so
// the test drives the actually-shipped compile path rather than a parallel implementation.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';
import { PermissionStatus, type PermissionResponse } from '../../core';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } =
  metroSvelteTransformer;

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const GRANTED: PermissionResponse = {
  status: PermissionStatus.GRANTED,
  expires: 'never',
  granted: true,
  canAskAgain: true,
};
const DENIED: PermissionResponse = {
  status: PermissionStatus.DENIED,
  expires: 'never',
  granted: false,
  canAskAgain: true,
};

const getPermissionsAsyncMock = vi.fn(async () => GRANTED);
const requestPermissionsAsyncMock = vi.fn(async () => GRANTED);

// Same enum-shaped-object mock trick packages/battery/src/svelte/runes/use-battery-state's test
// uses for BatteryState.
vi.mock('../../core', () => ({
  getPermissionsAsync: () => getPermissionsAsyncMock(),
  requestPermissionsAsync: () => requestPermissionsAsyncMock(),
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}));

const ROOT_TAG = 91_621;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-permissions-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-permissions.svelte.mjs');

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  getPermissionsAsyncMock.mockClear();
  requestPermissionsAsyncMock.mockClear();
  getPermissionsAsyncMock.mockResolvedValue(GRANTED);
  requestPermissionsAsyncMock.mockResolvedValue(GRANTED);
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

// $state/$effect need Svelte's MODULE compiler, not the component compiler — a bare, uncompiled
// rune call throws `rune_outside_svelte` at runtime.
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

type IPermissions = {
  readonly status: PermissionResponse | null;
  readonly error: Error | null;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
};

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

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { usePermissions } from './.smoke-compiled-use-permissions.svelte.mjs';
       let { onReady, onStatus }: { onReady: (api: unknown) => void; onStatus: (status: unknown) => void } = $props();
       const permissions = usePermissions();
       onReady(permissions);
       $effect(() => { onStatus(permissions.status); });
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

function isPermissions(value: unknown): value is IPermissions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'request' in value &&
    'get' in value
  );
}

function isPermissionResponse(value: unknown): value is PermissionResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'granted' in value &&
    'status' in value
  );
}

async function mountPermissions(): Promise<{
  api: IPermissions;
  statuses: (PermissionResponse | null)[];
}> {
  const statuses: (PermissionResponse | null)[] = [];
  let api: IPermissions | undefined;
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    onReady: (value: unknown) => {
      if (isPermissions(value)) api = value;
    },
    onStatus: (value: unknown) => {
      statuses.push(isPermissionResponse(value) ? value : null);
    },
  });
  await tick();
  if (api === undefined) {
    throw new Error('the probe component body did not run');
  }
  return { api, statuses };
}

describe('usePermissions (Svelte)', () => {
  describe('Positive — status tracks the mount fetch and both imperative calls', () => {
    // why: a consumer that reads `.status` before the mount fetch settles must see "unknown"
    // (null), never a stale or fabricated permission value.
    it('starts at null before the initial get() resolves', async () => {
      const { statuses } = await mountPermissions();

      expect(statuses[0]).toBeNull();
    });

    // why: matches upstream usePermissions — the current permission status is checked once on
    // mount without prompting the user, so a consumer can render a granted/denied UI immediately.
    it('fetches the permission status on mount', async () => {
      const { api } = await mountPermissions();

      await vi.waitFor(() => expect(api.status).toEqual(GRANTED));
      expect(getPermissionsAsyncMock).toHaveBeenCalledTimes(1);
    });

    // why: request() is the only imperative path that can trigger the OS permission prompt — its
    // result (granted or denied) must become the new boxed status so the UI reacts to the user's
    // actual choice, not the status from before they were asked.
    it('request() re-fetches and updates the boxed status', async () => {
      const { api } = await mountPermissions();
      await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

      requestPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
      await api.request();

      expect(api.status).toEqual(DENIED);
    });

    // why: get() lets a consumer re-check status without re-prompting (e.g. after the user
    // returns from the OS settings screen) — it must refresh the boxed value like the mount fetch
    // does, not just report the value cached from mount.
    it('get() re-fetches and updates the boxed status', async () => {
      const { api } = await mountPermissions();
      await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

      getPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
      await api.get();

      expect(api.status).toEqual(DENIED);
    });
  });

  describe('Negative — a rejected native call propagates instead of being swallowed', () => {
    // why: request()/get() await the native call directly with no try/catch — a native failure
    // (e.g. the OS call itself erroring) must reach the caller as a rejection so the app can show
    // an error, not be silently absorbed into a stale or default status.
    it('request() rejects when requestPermissionsAsync rejects, leaving status untouched', async () => {
      const { api } = await mountPermissions();
      await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

      const failure = new Error('permission request failed');
      requestPermissionsAsyncMock.mockRejectedValueOnce(failure);

      await expect(api.request()).rejects.toThrow(failure);
      expect(api.status).toEqual(GRANTED);
    });

    // why: same contract as request() — get()'s `status = response` assignment sits after the
    // `await`, so a rejection must skip that assignment entirely rather than write a garbage
    // value.
    it('get() rejects when getPermissionsAsync rejects, leaving status untouched', async () => {
      const { api } = await mountPermissions();
      await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

      const failure = new Error('permission read failed');
      getPermissionsAsyncMock.mockRejectedValueOnce(failure);

      await expect(api.get()).rejects.toThrow(failure);
      expect(api.status).toEqual(GRANTED);
    });

    // why: the $effect's mount fetch has no caller to reject to. It used to be `void get()`, so a
    // native rejection escaped the rune entirely as an unhandled promise rejection and left
    // `status` at null — indistinguishable from "still fetching".
    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      getPermissionsAsyncMock.mockRejectedValueOnce(
        new Error('permission read failed'),
      );

      const [{ api }, unhandled] =
        await collectUnhandledRejections(mountPermissions);

      await vi.waitFor(() =>
        expect(api.error?.message).toBe('permission read failed'),
      );
      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(api.status).toBeNull();
    });

    // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
    // slate — a stale error next to a freshly fetched status would keep reading as "broken".
    it('clears the recorded error once a later get() succeeds', async () => {
      getPermissionsAsyncMock.mockRejectedValueOnce(
        new Error('permission read failed'),
      );
      const { api } = await mountPermissions();
      await vi.waitFor(() => expect(api.error).not.toBeNull());

      await api.get();

      expect(api.error).toBeNull();
      expect(api.status).toEqual(GRANTED);
    });
  });
});

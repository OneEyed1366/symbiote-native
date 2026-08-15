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

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

type IPermissionResponse = {
  status: string;
  expires: 'never';
  granted: boolean;
  canAskAgain: boolean;
};

const GRANTED: IPermissionResponse = {
  status: 'granted',
  expires: 'never',
  granted: true,
  canAskAgain: true,
};
const DENIED: IPermissionResponse = {
  status: 'denied',
  expires: 'never',
  granted: false,
  canAskAgain: true,
};

const getPermissionsAsyncMock = vi.fn(async () => GRANTED);
const requestPermissionsAsyncMock = vi.fn(async () => GRANTED);

vi.mock('../../core', () => ({
  getPermissionsAsync: () => getPermissionsAsyncMock(),
  requestPermissionsAsync: () => requestPermissionsAsyncMock(),
}));

const ROOT_TAG = 91_621;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-permissions-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-permissions.svelte.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

// $state/$effect need Svelte's MODULE compiler, not the component compiler — a bare, uncompiled
// rune call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-permissions.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-permissions.svelte.ts'));
}

type IPermissions = {
  readonly status: IPermissionResponse | null;
  request: () => Promise<IPermissionResponse>;
  get: () => Promise<IPermissionResponse>;
};

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
  return typeof value === 'object' && value !== null && 'request' in value && 'get' in value;
}

function isPermissionResponse(value: unknown): value is IPermissionResponse {
  return typeof value === 'object' && value !== null && 'granted' in value && 'status' in value;
}

async function mountPermissions(): Promise<{
  api: IPermissions;
  statuses: (IPermissionResponse | null)[];
}> {
  const statuses: (IPermissionResponse | null)[] = [];
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
  it('starts at null before the initial get() resolves', async () => {
    const { statuses } = await mountPermissions();

    expect(statuses[0]).toBeNull();
  });

  it('fetches the permission status on mount', async () => {
    const { api } = await mountPermissions();

    await vi.waitFor(() => expect(api.status).toEqual(GRANTED));
    expect(getPermissionsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('request() re-fetches and updates the boxed status', async () => {
    const { api } = await mountPermissions();
    await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

    requestPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
    await api.request();

    expect(api.status).toEqual(DENIED);
  });

  it('get() re-fetches and updates the boxed status', async () => {
    const { api } = await mountPermissions();
    await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

    getPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
    await api.get();

    expect(api.status).toEqual(DENIED);
  });
});

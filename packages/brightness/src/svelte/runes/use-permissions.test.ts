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
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/svelte/runes/use-battery-state's test
// uses for BatteryState.
vi.mock('../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
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

const ROOT_TAG = 91_611;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-permissions-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-permissions.svelte.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
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
  readonly status: PermissionResponse | null;
  request: () => Promise<PermissionResponse>;
  get: () => Promise<PermissionResponse>;
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

function isPermissionResponse(value: unknown): value is PermissionResponse {
  return typeof value === 'object' && value !== null && 'granted' in value && 'status' in value;
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
  it('starts at null before the initial fetch resolves', async () => {
    const { statuses } = await mountPermissions();

    expect(statuses[0]).toBeNull();
  });

  it('fetches the permission status once on mount', async () => {
    const { api } = await mountPermissions();

    await vi.waitFor(() => expect(api.status).toEqual(GRANTED));
    expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('request() delegates to requestPermissionsAsync and updates the status', async () => {
    const { api } = await mountPermissions();
    await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

    requestPermissionsAsync.mockResolvedValueOnce(DENIED);
    await api.request();

    expect(api.status).toEqual(DENIED);
  });

  it('get() re-fetches and updates the status', async () => {
    const { api } = await mountPermissions();
    await vi.waitFor(() => expect(api.status).toEqual(GRANTED));

    getPermissionsAsync.mockResolvedValueOnce(DENIED);
    await api.get();

    expect(api.status).toEqual(DENIED);
  });
});

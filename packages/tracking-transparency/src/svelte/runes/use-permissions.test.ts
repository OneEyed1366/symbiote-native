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
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick the Vue twin's test uses.
vi.mock('../../core', () => ({
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
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

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

// $state/$effect require Svelte's MODULE compiler, not the component compiler — a bare,
// uncompiled rune call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-permissions.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-permissions.svelte.ts'));
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

describe('usePermissions (Svelte)', () => {
  it('starts at null before the initial fetch resolves', async () => {
    const permissions = await mountPermissions();

    expect(permissions.status).toBe(null);
  });

  it('fetches the permission status once on mount', async () => {
    const permissions = await mountPermissions();

    await vi.waitFor(() => expect(permissions.status).toEqual(GRANTED));
    expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('request() delegates to requestTrackingPermissionsAsync and updates the status', async () => {
    const permissions = await mountPermissions();
    await vi.waitFor(() => expect(permissions.status).toEqual(GRANTED));

    requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
    await permissions.request();

    expect(permissions.status).toEqual(DENIED);
  });

  it('get() re-fetches and updates the status', async () => {
    const permissions = await mountPermissions();
    await vi.waitFor(() => expect(permissions.status).toEqual(GRANTED));

    getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
    await permissions.get();

    expect(permissions.status).toEqual(DENIED);
  });
});

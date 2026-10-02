// Svelte twin of ../react and ../vue's root tests, driven through the real compiler and slot

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { markFirstRender, reportCaughtError } = vi.hoisted(() => ({
  markFirstRender: vi.fn(),
  reportCaughtError: vi.fn(),
}));

vi.mock('../core', () => ({ markFirstRender }));
vi.mock('../core/report-caught-error', () => ({ reportCaughtError }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_920;
const BOOM = 'render exploded';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('app-metrics-root');
let consoleError: ReturnType<typeof vi.spyOn>;

const EXPLODING_CHILD_PATH = join(__dirname, 'root-exploding-child.svelte');
const EXPLODING_CHILD_SOURCE = `<script lang="ts">throw new Error('${BOOM}');</script>`;

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('app-metrics-root');
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  writeFileSync(EXPLODING_CHILD_PATH, EXPLODING_CHILD_SOURCE);
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
  consoleError.mockRestore();
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
  rmSync(EXPLODING_CHILD_PATH, { force: true });
});

async function mountApp(name: string, appSource: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, appSource);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('AppMetricsRoot (Positive: marks first render, gates the error boundary)', () => {
  it('marks the first render and renders children', async () => {
    await mountApp(
      'healthy-root-app',
      `<script lang="ts">
       import AppMetricsRoot from './AppMetricsRoot.svelte';
     </script>
     <AppMetricsRoot>
       {#snippet children()}<text>app</text>{/snippet}
     </AppMetricsRoot>`,
    );

    expect(markFirstRender).toHaveBeenCalledTimes(1);
    expect(live.texts(live.appRoot())).toEqual(['app']);
  });

  it('mounts an error boundary rendering the fallback when errorBoundaryFallback is given', async () => {
    await mountApp(
      'fallback-root-app',
      `<script lang="ts">
       import AppMetricsRoot from './AppMetricsRoot.svelte';
       import Exploding from './root-exploding-child.svelte';
     </script>
     <AppMetricsRoot>
       {#snippet errorBoundaryFallback()}<text>crashed</text>{/snippet}
       {#snippet children()}<Exploding />{/snippet}
     </AppMetricsRoot>`,
    );

    expect(live.texts(live.appRoot())).toEqual(['crashed']);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('mounts no boundary without a fallback, leaving the throw to reach the native channel', async () => {
    // `mount` rethrows an uncaught error rather than swallowing it, this adapter's own tested
    // contract - so no boundary here means no boundary anywhere, off `reportCaughtError` entirely
    const nativeReportError = vi.fn();
    Object.assign(globalThis, {
      ErrorUtils: { reportError: nativeReportError },
    });

    await expect(
      mountApp(
        'no-boundary-root-app',
        `<script lang="ts">
         import AppMetricsRoot from './AppMetricsRoot.svelte';
         import Exploding from './root-exploding-child.svelte';
       </script>
       <AppMetricsRoot>
         {#snippet children()}<Exploding />{/snippet}
       </AppMetricsRoot>`,
      ),
    ).rejects.toThrow(BOOM);

    expect(reportCaughtError).not.toHaveBeenCalled();
    expect(nativeReportError).toHaveBeenCalledTimes(1);
  });
});

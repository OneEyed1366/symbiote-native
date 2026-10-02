// Svelte twin of ../react and ../vue's boundary tests, driven through the real compiler and a
// real Fabric slot - same harness as packages/sqlite/src/svelte/SQLiteProvider.smoke.test.ts

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

const { reportCaughtError } = vi.hoisted(() => ({
  reportCaughtError: vi.fn(),
}));

vi.mock('../core/report-caught-error', () => ({ reportCaughtError }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_910;
const BOOM = 'render exploded';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('app-metrics-error-boundary');
let consoleError: ReturnType<typeof vi.spyOn>;

const EXPLODING_CHILD_PATH = join(__dirname, 'boundary-exploding-child.svelte');
const EXPLODING_CHILD_SOURCE = `<script lang="ts">throw new Error('${BOOM}');</script>`;

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('app-metrics-error-boundary');
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

describe('AppMetricsErrorBoundary (Positive: catches, reports, renders a fallback)', () => {
  it('renders children unchanged when nothing throws', async () => {
    await mountApp(
      'healthy-app',
      `<script lang="ts">
       import AppMetricsErrorBoundary from './AppMetricsErrorBoundary.svelte';
     </script>
     <AppMetricsErrorBoundary fallback={null}>
       {#snippet children()}<text>healthy</text>{/snippet}
     </AppMetricsErrorBoundary>`,
    );

    expect(live.texts(live.appRoot())).toEqual(['healthy']);
    expect(reportCaughtError).not.toHaveBeenCalled();
  });

  it('renders the fallback snippet in place of the failed subtree', async () => {
    await mountApp(
      'fallback-app',
      `<script lang="ts">
       import AppMetricsErrorBoundary from './AppMetricsErrorBoundary.svelte';
       import Exploding from './boundary-exploding-child.svelte';
     </script>
     <AppMetricsErrorBoundary>
       {#snippet fallback()}<text>something broke</text>{/snippet}
       {#snippet children()}<Exploding />{/snippet}
     </AppMetricsErrorBoundary>`,
    );

    expect(live.texts(live.appRoot())).toEqual(['something broke']);
  });

  it('reports the caught error once', async () => {
    await mountApp(
      'reports-app',
      `<script lang="ts">
       import AppMetricsErrorBoundary from './AppMetricsErrorBoundary.svelte';
       import Exploding from './boundary-exploding-child.svelte';
     </script>
     <AppMetricsErrorBoundary>
       {#snippet fallback()}<text>caught</text>{/snippet}
       {#snippet children()}<Exploding />{/snippet}
     </AppMetricsErrorBoundary>`,
    );

    expect(reportCaughtError).toHaveBeenCalledTimes(1);
    const [error] = reportCaughtError.mock.calls[0] as [Error];
    expect(error.message).toBe(BOOM);
  });

  it('keeps a caught error off this engine own uncaught-error channel', async () => {
    const nativeReportError = vi.fn();
    Object.assign(globalThis, {
      ErrorUtils: { reportError: nativeReportError },
    });

    await mountApp(
      'native-channel-app',
      `<script lang="ts">
       import AppMetricsErrorBoundary from './AppMetricsErrorBoundary.svelte';
       import Exploding from './boundary-exploding-child.svelte';
     </script>
     <AppMetricsErrorBoundary>
       {#snippet fallback()}<text>caught</text>{/snippet}
       {#snippet children()}<Exploding />{/snippet}
     </AppMetricsErrorBoundary>`,
    );

    expect(nativeReportError).not.toHaveBeenCalled();
  });

  it('passes the error to the fallback snippet', async () => {
    await mountApp(
      'passes-error-app',
      `<script lang="ts">
       import AppMetricsErrorBoundary from './AppMetricsErrorBoundary.svelte';
       import Exploding from './boundary-exploding-child.svelte';
     </script>
     <AppMetricsErrorBoundary>
       {#snippet fallback({ error })}<text>caught: {error.message}</text>{/snippet}
       {#snippet children()}<Exploding />{/snippet}
     </AppMetricsErrorBoundary>`,
    );

    expect(live.texts(live.appRoot())).toEqual([`caught: ${BOOM}`]);
  });
});

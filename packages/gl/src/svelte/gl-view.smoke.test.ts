// Svelte `GLView` through the real compiler and the recording fabric

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const native = vi.hoisted(() => ({
  takeSnapshotAsync: vi.fn(async () => ({
    uri: 'u',
    localUri: 'u',
    width: 1,
    height: 1,
  })),
}));

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: () => native,
  CodedError: class extends Error {},
  UnavailabilityError: class extends Error {},
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_961;
const VIEW_NAME = 'ViewManagerAdapter_ExpoGL';
const CONTEXTS = '__EXGLContexts';

const fabric = installRecordingFabric();
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        directEventTypes: {
          topSurfaceCreate: { registrationName: 'onSurfaceCreate' },
        },
        validAttributes: {
          msaaSamples: true,
          enableExperimentalWorkletSupport: true,
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('gl-view');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  harness = createSvelteHarness('gl-view');
  platform.OS = 'ios';
  Reflect.set(globalThis, CONTEXTS, { '5': { contextId: 5 } });
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import GLView from './gl-view.svelte';
   let view = $state();
   globalThis.__glView = () => view;
 </script>
 <GLView bind:this={view} onContextCreate={globalThis.__onContextCreate} />`;

async function mountProbe(
  name: string,
  onContextCreate = vi.fn(),
): Promise<void> {
  Reflect.set(globalThis, '__onContextCreate', onContextCreate);
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

function createSurface(): void {
  const target = viewNode()?.instanceHandle;
  if (typeof target !== 'object' || target === null) throw new Error('no host');
  fabric.fireEvent(target, 'topSurfaceCreate', { exglCtxId: 5 });
}

describe('GLView', () => {
  it('paints the native surface with the multisampling prop', async () => {
    await mountProbe('props-app');

    expect(viewNode()?.props).toMatchObject({ msaaSamples: 4 });
  });

  it('hands `onContextCreate` the context once the surface is created', async () => {
    const onContextCreate = vi.fn();
    await mountProbe('context-app', onContextCreate);

    createSurface();

    expect(onContextCreate).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: 5 }),
    );
  });

  it('exposes the view functions on the instance', async () => {
    await mountProbe('handle-app');
    createSurface();

    const read: unknown = Reflect.get(globalThis, '__glView');
    const view: unknown = typeof read === 'function' ? read() : undefined;
    const snapshot: unknown = Reflect.get(Object(view), 'takeSnapshotAsync');
    if (typeof snapshot !== 'function') throw new Error('no takeSnapshotAsync');
    await snapshot({ format: 'png' });

    expect(native.takeSnapshotAsync).toHaveBeenCalledWith(5, { format: 'png' });
  });

  it('forgets the context when the view is destroyed', async () => {
    await mountProbe('dispose-app');
    createSurface();

    unmount(ROOT_TAG);
    await tick();

    expect(
      Reflect.get(Object(Reflect.get(globalThis, CONTEXTS)), '5'),
    ).toBeUndefined();
  });
});

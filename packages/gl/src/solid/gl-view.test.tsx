// Solid `GLView` over the recording fabric with an injected view config

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IGLViewHandle } from '../core';

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

const { GLView } = await import('./gl-view');

const ROOT_TAG = 2711;
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

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.set(globalThis, CONTEXTS, { '5': { contextId: 5 } });
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => unmount(ROOT_TAG));

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
    mount(ROOT_TAG, () => <GLView onContextCreate={() => undefined} />);
    await tick();

    expect(viewNode()?.props).toMatchObject({ msaaSamples: 4 });
  });

  it('hands `onContextCreate` the context once the surface is created', async () => {
    const onContextCreate = vi.fn();
    mount(ROOT_TAG, () => <GLView onContextCreate={onContextCreate} />);
    await tick();

    createSurface();

    expect(onContextCreate).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: 5 }),
    );
  });

  it('gives the handle to `ref` that snapshots the context of the view', async () => {
    let handle: IGLViewHandle | undefined;
    mount(ROOT_TAG, () => (
      <GLView
        onContextCreate={() => undefined}
        ref={instance => (handle = instance)}
      />
    ));
    await tick();
    createSurface();

    await handle?.takeSnapshotAsync({ format: 'png' });

    expect(native.takeSnapshotAsync).toHaveBeenCalledWith(5, { format: 'png' });
  });

  it('forgets the context when the owner is disposed', async () => {
    mount(ROOT_TAG, () => <GLView onContextCreate={() => undefined} />);
    await tick();
    createSurface();

    unmount(ROOT_TAG);

    expect(
      Reflect.get(Object(Reflect.get(globalThis, CONTEXTS)), '5'),
    ).toBeUndefined();
  });
});

// Vue `GLView` over the recording fabric with an injected view config

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/vue';
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

const ROOT_TAG = 2611;
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

let handle: IGLViewHandle | null = null;

function isHandle(value: unknown): value is IGLViewHandle {
  return typeof Reflect.get(Object(value), 'takeSnapshotAsync') === 'function';
}

async function mountView(attrs: Record<string, unknown>): Promise<void> {
  const Host = defineComponent(
    () => (): VNode =>
      h(GLView, {
        ...attrs,
        ref: (instance: unknown) => {
          handle = isHandle(instance) ? instance : null;
        },
      }),
  );
  mount(ROOT_TAG, { render: (): VNode => h(Host) });
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  handle = null;
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
    await mountView({ onContextCreate: () => undefined });

    expect(viewNode()?.props).toMatchObject({ msaaSamples: 4 });
  });

  it('hands `onContextCreate` the context once the surface is created', async () => {
    const onContextCreate = vi.fn();
    await mountView({ onContextCreate });

    createSurface();

    expect(onContextCreate).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: 5 }),
    );
  });

  it('exposes the handle that snapshots the context of the view', async () => {
    await mountView({ onContextCreate: () => undefined });
    createSurface();

    await handle?.takeSnapshotAsync({ format: 'png' });

    expect(native.takeSnapshotAsync).toHaveBeenCalledWith(5, { format: 'png' });
  });

  it('forgets the context when the view unmounts', async () => {
    await mountView({ onContextCreate: () => undefined });
    createSurface();

    unmount(ROOT_TAG);

    expect(
      Reflect.get(Object(Reflect.get(globalThis, CONTEXTS)), '5'),
    ).toBeUndefined();
  });
});

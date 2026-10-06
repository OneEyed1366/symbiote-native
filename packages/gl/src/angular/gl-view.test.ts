// Angular `GLView` over the recording fabric with an injected view config

import '@angular/compiler';
import { Component, ViewChild } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';

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
const handlers = vi.hoisted(() => ({ onContextCreate: vi.fn() }));

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: () => native,
  CodedError: class extends Error {},
  UnavailabilityError: class extends Error {},
}));

const { GLView } = await import('./gl-view');

const ROOT_TAG = 2811;
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

let host: HostFixture | undefined;

@Component({
  selector: 'gl-host',
  standalone: true,
  imports: [GLView],
  template: `<GLView [onContextCreate]="onContextCreate" />`,
})
class HostFixture {
  @ViewChild(GLView) view?: InstanceType<typeof GLView>;
  readonly onContextCreate = handlers.onContextCreate;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  host = undefined;
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
    mount(ROOT_TAG, HostFixture);
    await tick();

    expect(viewNode()?.props).toMatchObject({ msaaSamples: 4 });
  });

  it('hands `onContextCreate` the context once the surface is created', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    createSurface();

    expect(handlers.onContextCreate).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: 5 }),
    );
    expect(host?.view?.exglCtxId).toBe(5);
  });

  it('exposes the view functions on the component', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();
    createSurface();

    await host?.view?.takeSnapshotAsync({ format: 'png' });

    expect(native.takeSnapshotAsync).toHaveBeenCalledWith(5, { format: 'png' });
  });

  it('forgets the context when the component is destroyed', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();
    createSurface();

    unmount(ROOT_TAG);

    expect(
      Reflect.get(Object(Reflect.get(globalThis, CONTEXTS)), '5'),
    ).toBeUndefined();
  });
});

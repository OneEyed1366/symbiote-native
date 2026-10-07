import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement, createSurface } from '@symbiote-native/engine';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const native = vi.hoisted(() => ({
  createContextAsync: vi.fn(),
  destroyContextAsync: vi.fn(async () => true),
  takeSnapshotAsync: vi.fn(async () => ({
    uri: 'u',
    localUri: 'u',
    width: 1,
    height: 1,
  })),
  createCameraTextureAsync: vi.fn(async () => ({ exglObjId: 11 })),
  destroyObjectAsync: vi.fn(async () => true),
}));

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: () => native,
  CodedError: class extends Error {},
  UnavailabilityError: class extends Error {
    constructor(pkg: string, method: string) {
      super(`${pkg}: ${method} is unavailable`);
    }
  },
}));

const { createGLView, glViewName } = await import('./gl-view');

installRecordingFabric();

const CONTEXTS = '__EXGLContexts';
let nextRootTag = 9300;

function mountedNode() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

function nativeProps(props: object): Record<string, unknown> {
  const root = createGLView(() => null).render({
    onContextCreate: () => undefined,
    ...props,
  });
  const [child] = root?.children ?? [];
  return typeof child === 'object' ? child.props : {};
}

function fireSurfaceCreate(
  view: ReturnType<typeof createGLView>,
  props: object,
  id: number,
) {
  const root = view.render({ onContextCreate: () => undefined, ...props });
  const [child] = root?.children ?? [];
  const handler =
    typeof child === 'object' ? child.props.onSurfaceCreate : undefined;
  if (typeof handler !== 'function')
    throw new Error('onSurfaceCreate is not wired');
  handler({ nativeEvent: { exglCtxId: id } });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.set(globalThis, CONTEXTS, { '5': { contextId: 5 } });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('createGLView render', () => {
  it('wraps the native surface in a view that takes the other props', () => {
    const root = createGLView(() => null).render({
      onContextCreate: () => undefined,
      testID: 'gl',
      style: { width: 10 },
    });

    expect(root?.type).toBe('view');
    expect(root?.props).toMatchObject({ testID: 'gl', style: { width: 10 } });
    expect(root?.props).not.toHaveProperty('onContextCreate');
    expect(root?.children).toHaveLength(1);
  });

  it('paints the surface that fills the view with iOS multisampling', () => {
    expect(nativeProps({})).toMatchObject({
      style: { flex: 1, backgroundColor: 'transparent' },
      msaaSamples: 4,
      enableExperimentalWorkletSupport: false,
    });
  });

  it('leaves the multisampling and the transparent background to iOS', () => {
    platform.OS = 'android';
    const props = nativeProps({ msaaSamples: 8 });

    expect(props.msaaSamples).toBeUndefined();
    expect(props.style).toEqual({ flex: 1 });
  });

  it('names the view manager adapter of the module', () => {
    expect(glViewName()).toBe('ViewManagerAdapter_ExpoGL');
    expect(
      createGLView(() => null).render({ onContextCreate: () => undefined })
        ?.children[0],
    ).toMatchObject({ type: 'ViewManagerAdapter_ExpoGL' });
  });

  it('renders nothing and warns when the view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });

    expect(
      createGLView(() => null).render({ onContextCreate: () => undefined }),
    ).toBeNull();
  });

  it('warns when worklet support changes after the first render', () => {
    const view = createGLView(() => null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    view.render({
      onContextCreate: () => undefined,
      enableExperimentalWorkletSupport: false,
    });

    view.render({
      onContextCreate: () => undefined,
      enableExperimentalWorkletSupport: true,
    });

    expect(warn).toHaveBeenCalledWith(
      'Updating prop enableExperimentalWorkletSupport is not supported',
    );
  });
});

describe('createGLView surface', () => {
  it('hands `onContextCreate` the context of the created surface', () => {
    const onContextCreate = vi.fn();
    const view = createGLView(() => null);

    fireSurfaceCreate(view, { onContextCreate }, 5);

    expect(onContextCreate).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: 5 }),
    );
    expect(view.handle.exglCtxId).toBe(5);
  });

  it('forgets the context when the view is disposed', () => {
    const view = createGLView(() => null);
    fireSurfaceCreate(view, {}, 5);

    view.dispose();

    expect(
      Reflect.get(Object(Reflect.get(globalThis, CONTEXTS)), '5'),
    ).toBeUndefined();
  });

  it('disposes a view whose surface never came without touching contexts', () => {
    createGLView(() => null).dispose();

    expect(
      Reflect.get(Object(Reflect.get(globalThis, CONTEXTS)), '5'),
    ).toBeDefined();
  });
});

describe('createGLView handle', () => {
  it('snapshots the context of its own surface', async () => {
    const view = createGLView(() => null);
    fireSurfaceCreate(view, {}, 5);

    await view.handle.takeSnapshotAsync({ flip: true });

    expect(native.takeSnapshotAsync).toHaveBeenCalledWith(5, { flip: true });
  });

  it('fails to snapshot before the surface exists', async () => {
    await expect(
      createGLView(() => null).handle.takeSnapshotAsync(),
    ).rejects.toThrow('Invalid EXGLContext id');
  });

  it('makes a camera texture from a native tag', async () => {
    const view = createGLView(() => null);
    fireSurfaceCreate(view, {}, 5);

    const texture = await view.handle.createCameraTextureAsync(42);

    expect(native.createCameraTextureAsync).toHaveBeenCalledWith(5, 42);
    expect(texture).toEqual({ id: 11 });
  });

  it('makes a camera texture from the host node of a view', async () => {
    const view = createGLView(() => null);
    fireSurfaceCreate(view, {}, 5);

    await view.handle.createCameraTextureAsync(mountedNode());

    expect(native.createCameraTextureAsync).toHaveBeenCalledWith(
      5,
      expect.any(Number),
    );
  });

  it('fails to make a camera texture before the surface exists', async () => {
    await expect(
      createGLView(() => null).handle.createCameraTextureAsync(42),
    ).rejects.toThrow("GLView's surface is not created yet!");
  });

  it('fails to make a camera texture where native has none', async () => {
    const view = createGLView(() => null);
    fireSurfaceCreate(view, {}, 5);
    Reflect.deleteProperty(native, 'createCameraTextureAsync');

    await expect(view.handle.createCameraTextureAsync(42)).rejects.toThrow(
      'unavailable',
    );
  });

  it('destroys a GL object by its id', async () => {
    expect(
      await createGLView(() => null).handle.destroyObjectAsync({ id: 9 }),
    ).toBe(true);

    expect(native.destroyObjectAsync).toHaveBeenCalledWith(9);
  });
});

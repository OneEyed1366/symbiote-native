import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  createContextAsync: vi.fn(async () => ({ exglCtxId: 3 })),
  destroyContextAsync: vi.fn(async () => true),
  takeSnapshotAsync: vi.fn(async () => ({
    uri: 'file:///s.jpg',
    localUri: 'file:///s.jpg',
    width: 2,
    height: 2,
  })),
}));

vi.mock('expo-modules-core', () => ({
  requireNativeModule: () => native,
  CodedError: class extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const {
  createContextAsync,
  destroyContextAsync,
  getContextId,
  getGl,
  getWorkletContext,
  takeSnapshotAsync,
} = await import('./gl-context');

const CONTEXTS = '__EXGLContexts';

function installContext(id: number): object {
  const gl = { contextId: id };
  Reflect.set(globalThis, CONTEXTS, { [String(id)]: gl });
  return gl;
}

beforeEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, CONTEXTS);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, CONTEXTS);
});

describe('getGl', () => {
  it('answers the context the native module installed, with logging configured', () => {
    const gl = installContext(3);

    expect(getGl(3)).toBe(gl);
    expect(typeof Reflect.get(gl, '__expoSetLogging')).toBe('function');
  });

  it('fails with a coded error when GL is not installed on the runtime', () => {
    expect(() => getGl(3)).toThrow(
      expect.objectContaining({ code: 'ERR_GL_NOT_AVAILABLE' }),
    );
  });

  it('fails when there is no context of that id', () => {
    installContext(3);

    expect(() => getGl(4)).toThrow('4');
  });
});

describe('getContextId', () => {
  it('reads the id of a context or takes a number', () => {
    expect(getContextId(5)).toBe(5);
    installContext(6);
    expect(getContextId(getGl(6))).toBe(6);
  });

  it('rejects a missing or zero id', () => {
    expect(() => getContextId(undefined)).toThrow('Invalid EXGLContext id');
    expect(() => getContextId(0)).toThrow('Invalid EXGLContext id');
  });
});

describe('createContextAsync', () => {
  it('creates a headless context and answers it', async () => {
    const gl = installContext(3);

    expect(await createContextAsync()).toBe(gl);
  });
});

describe('destroyContextAsync', () => {
  it('forgets the context and destroys it natively', async () => {
    installContext(3);

    expect(await destroyContextAsync(3)).toBe(true);

    expect(native.destroyContextAsync).toHaveBeenCalledWith(3);
    expect(
      Reflect.get(Object(Reflect.get(globalThis, CONTEXTS)), '3'),
    ).toBeUndefined();
  });
});

describe('takeSnapshotAsync', () => {
  it('snapshots the context by id with the options', async () => {
    const snapshot = await takeSnapshotAsync(7, { format: 'png', flip: true });

    expect(native.takeSnapshotAsync).toHaveBeenCalledWith(7, {
      format: 'png',
      flip: true,
    });
    expect(snapshot.width).toBe(2);
  });

  it('defaults the options to none', async () => {
    await takeSnapshotAsync(7);

    expect(native.takeSnapshotAsync).toHaveBeenCalledWith(7, {});
  });
});

describe('getWorkletContext', () => {
  it('fails where the worklet runtime is not available', () => {
    expect(() => getWorkletContext(3)).toThrow(
      'Worklet runtime is not available',
    );
  });
});

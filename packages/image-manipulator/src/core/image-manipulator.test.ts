import { afterEach, describe, expect, it, vi } from 'vitest';

function createFakeContext() {
  const context = {
    resize: vi.fn(() => context),
    rotate: vi.fn(() => context),
    flip: vi.fn(() => context),
    crop: vi.fn(() => context),
    reset: vi.fn(() => context),
    renderAsync: vi.fn(async () => fakeImage),
    release: vi.fn(),
  };
  return context;
}

const fakeImage = {
  width: 10,
  height: 10,
  saveAsync: vi.fn(async () => ({
    uri: 'file:///out.jpg',
    width: 10,
    height: 10,
  })),
  release: vi.fn(),
};

const FAKE_NATIVE_IMAGE_MANIPULATOR = {
  manipulate: vi.fn(() => createFakeContext()),
};

// requireNativeModule() only resolves on-device — faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/mail-composer/src/core/mail-composer.test.ts.
vi.mock('./native-module', () => ({
  expoImageManipulator: FAKE_NATIVE_IMAGE_MANIPULATOR,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/application/src/core/application.test.ts uses.
vi.mock('expo-modules-core', () => ({
  SharedObject: class SharedObject {},
  SharedRef: class SharedRef {},
  requireNativeModule: vi.fn(),
}));

const { manipulate, manipulateAsync } = await import('./image-manipulator');

afterEach(() => {
  vi.clearAllMocks();
});

describe('manipulate', () => {
  it('delegates to the native module', () => {
    manipulate('file:///a.jpg');
    expect(FAKE_NATIVE_IMAGE_MANIPULATOR.manipulate).toHaveBeenCalledWith(
      'file:///a.jpg',
    );
  });
});

describe('manipulateAsync', () => {
  it('rejects a non-string uri', async () => {
    await expect(manipulateAsync(123 as never)).rejects.toThrow(
      /must be a string/,
    );
  });

  it('defaults actions to an empty array and format to jpeg', async () => {
    const result = await manipulateAsync('file:///a.jpg');
    const context =
      FAKE_NATIVE_IMAGE_MANIPULATOR.manipulate.mock.results[0]!.value;
    expect(context.resize).not.toHaveBeenCalled();
    expect(fakeImage.saveAsync).toHaveBeenCalledWith({ format: 'jpeg' });
    expect(context.release).toHaveBeenCalled();
    expect(fakeImage.release).toHaveBeenCalled();
    expect(result).toEqual({ uri: 'file:///out.jpg', width: 10, height: 10 });
  });

  it('applies each action to the context in order', async () => {
    await manipulateAsync('file:///a.jpg', [
      { resize: { width: 100 } },
      { rotate: 90 },
      { flip: 'horizontal' as never },
      { crop: { originX: 0, originY: 0, width: 10, height: 10 } },
    ]);
    const context =
      FAKE_NATIVE_IMAGE_MANIPULATOR.manipulate.mock.results[0]!.value;
    expect(context.resize).toHaveBeenCalledWith({ width: 100 });
    expect(context.rotate).toHaveBeenCalledWith(90);
    expect(context.flip).toHaveBeenCalledWith('horizontal');
    expect(context.crop).toHaveBeenCalledWith({
      originX: 0,
      originY: 0,
      width: 10,
      height: 10,
    });
  });
});

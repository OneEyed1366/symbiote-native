import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_DOCUMENT_PICKER = {
  getDocumentAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ name: 'a.pdf', uri: 'file:///a.pdf', lastModified: 0 }],
  })),
};

// requireNativeModule() only resolves on-device — faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/mail-composer/src/core/mail-composer.test.ts.
vi.mock('./native-module', () => ({
  expoDocumentPicker: FAKE_NATIVE_DOCUMENT_PICKER,
}));

const { getDocumentAsync } = await import('./document-picker');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getDocumentAsync', () => {
  it('defaults to *\\/*, copyToCacheDirectory, and single-select', async () => {
    await getDocumentAsync();
    expect(FAKE_NATIVE_DOCUMENT_PICKER.getDocumentAsync).toHaveBeenCalledWith({
      type: ['*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it('wraps a string type into a single-item array', async () => {
    await getDocumentAsync({ type: 'image/*' });
    expect(FAKE_NATIVE_DOCUMENT_PICKER.getDocumentAsync).toHaveBeenCalledWith({
      type: ['image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it('passes an array type through unchanged', async () => {
    await getDocumentAsync({ type: ['image/*', 'application/pdf'] });
    expect(FAKE_NATIVE_DOCUMENT_PICKER.getDocumentAsync).toHaveBeenCalledWith({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it('resolves with the native result', async () => {
    await expect(getDocumentAsync()).resolves.toEqual({
      canceled: false,
      assets: [{ name: 'a.pdf', uri: 'file:///a.pdf', lastModified: 0 }],
    });
  });
});

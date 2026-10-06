import { describe, expect, it, vi } from 'vitest';

vi.mock('./native-module', () => ({
  expoCamera: {
    Type: { front: 1, back: 0 },
    FlashMode: { off: 0, on: 1, auto: 2, screen: 3 },
  },
}));

const { ensureNativeProps } = await import('./props');

describe('ensureNativeProps', () => {
  it('turns the flash prop into the native number and keeps the name in flashMode', () => {
    expect(ensureNativeProps({ flash: 'auto' })).toMatchObject({
      flash: 2,
      flashMode: 'auto',
    });
  });

  it('falls back to flashMode off', () => {
    expect(ensureNativeProps({})).toMatchObject({ flashMode: 'off' });
  });

  it('maps a `type` string through the native Type table', () => {
    expect(ensureNativeProps({ type: 'front' })).toMatchObject({ type: 1 });
  });

  it('enables the barcode scanner only when a handler is given', () => {
    expect(
      ensureNativeProps({ onBarcodeScanned: () => undefined }),
    ).toMatchObject({ barcodeScannerEnabled: true });
    expect(ensureNativeProps({})).toMatchObject({
      barcodeScannerEnabled: false,
    });
  });

  it('defaults mute to false and passes autofocus as autoFocus', () => {
    expect(ensureNativeProps({})).toMatchObject({
      mute: false,
      autoFocus: 'off',
    });
    expect(ensureNativeProps({ mute: true, autofocus: 'on' })).toMatchObject({
      mute: true,
      autoFocus: 'on',
    });
  });

  it('leaves values that are not conversion keys untouched', () => {
    expect(ensureNativeProps({ zoom: 0.5, facing: 'front' })).toMatchObject({
      zoom: 0.5,
      facing: 'front',
    });
  });

  it('drops the poster, it exists only on web', () => {
    expect(ensureNativeProps({ poster: 'a.png' })).not.toHaveProperty('poster');
  });
});

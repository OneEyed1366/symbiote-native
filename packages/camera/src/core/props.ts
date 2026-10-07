import { expoCamera } from './native-module';

type INativeProps = Record<string, unknown>;

// Values under these keys become native options, the tables come from the native module
function conversionTableFor(key: string): Record<string, unknown> | undefined {
  if (key === 'type') return expoCamera.Type;
  if (key === 'flash') return expoCamera.FlashMode;
  return undefined;
}

function convertNativeProps(props: object): INativeProps {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => {
      const table = conversionTableFor(key);
      return [key, typeof value === 'string' && table ? table[value] : value];
    }),
  );
}

/** The props the native view takes, built from the friendly ones of the view */
export function ensureNativeProps(props: object): INativeProps {
  const { poster: _poster, ...native } = convertNativeProps(props);
  return {
    ...native,
    barcodeScannerEnabled: Boolean(Reflect.get(props, 'onBarcodeScanned')),
    flashMode: Reflect.get(props, 'flash') ?? 'off',
    mute: Reflect.get(props, 'mute') ?? false,
    autoFocus: Reflect.get(props, 'autofocus') ?? 'off',
  };
}

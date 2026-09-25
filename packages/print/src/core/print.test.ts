import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_PRINT = {
  Orientation: { portrait: 'portrait', landscape: 'landscape' },
  print: vi.fn(async () => undefined),
  selectPrinter: vi.fn(async () => ({ name: 'Office', url: 'ipp://x' })),
  printToFileAsync: vi.fn(async () => ({
    uri: 'file:///x.pdf',
    numberOfPages: 1,
  })),
};

// requireNativeModule() only resolves on-device — faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/mail-composer/src/core/mail-composer.test.ts.
vi.mock('./native-module', () => ({
  expoPrint: FAKE_NATIVE_PRINT,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/application/src/core/application.test.ts uses.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { Orientation, printAsync, printToFileAsync, selectPrinterAsync } =
  await import('./print');

afterEach(() => {
  vi.clearAllMocks();
});

describe('Orientation', () => {
  it('re-exports the native module constant', () => {
    expect(Orientation).toEqual({
      portrait: 'portrait',
      landscape: 'landscape',
    });
  });
});

describe('printAsync', () => {
  it('rejects when neither uri nor html is given', async () => {
    await expect(printAsync({})).rejects.toThrow(
      'Must provide either `html` or `uri` to print',
    );
  });

  it('rejects when both uri and html are given', async () => {
    await expect(
      printAsync({ uri: 'file:///a.pdf', html: '<p>x</p>' }),
    ).rejects.toThrow('Must provide exactly one of `html` and `uri`');
  });

  it('delegates to the native module', async () => {
    await printAsync({ html: '<p>x</p>' });
    expect(FAKE_NATIVE_PRINT.print).toHaveBeenCalledWith({ html: '<p>x</p>' });
  });

  it('rejects a second concurrent call while one is in flight', async () => {
    let resolvePrint: () => void = () => {};
    FAKE_NATIVE_PRINT.print.mockImplementationOnce(
      () => new Promise(resolve => (resolvePrint = () => resolve(undefined))),
    );
    const first = printAsync({ html: '<p>x</p>' });
    await expect(printAsync({ html: '<p>y</p>' })).rejects.toThrow(
      'Another print request is already in progress',
    );
    resolvePrint();
    await first;
  });
});

describe('selectPrinterAsync', () => {
  it('delegates to the native module when available', async () => {
    await expect(selectPrinterAsync()).resolves.toEqual({
      name: 'Office',
      url: 'ipp://x',
    });
  });

  it('throws UnavailabilityError when the native module has no selectPrinter', async () => {
    FAKE_NATIVE_PRINT.selectPrinter = undefined as never;
    await expect(selectPrinterAsync()).rejects.toThrow(/selectPrinterAsync/);
    FAKE_NATIVE_PRINT.selectPrinter = vi.fn(async () => ({
      name: 'Office',
      url: 'ipp://x',
    }));
  });
});

describe('printToFileAsync', () => {
  it('forwards options and resolves with the native result', async () => {
    const options = { html: '<p>x</p>', base64: true };
    await expect(printToFileAsync(options)).resolves.toEqual({
      uri: 'file:///x.pdf',
      numberOfPages: 1,
    });
    expect(FAKE_NATIVE_PRINT.printToFileAsync).toHaveBeenCalledWith(options);
  });

  it('defaults to an empty options object', async () => {
    await printToFileAsync();
    expect(FAKE_NATIVE_PRINT.printToFileAsync).toHaveBeenCalledWith({});
  });
});

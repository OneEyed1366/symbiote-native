import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();

// Same fake-module pattern as app-metrics.test.ts - the real native module only resolves on
// device
vi.mock('./app-metrics', () => ({ reportError }));

let installErrorHandler: typeof import('./install-error-handler').installErrorHandler;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  ({ installErrorHandler } = await import('./install-error-handler'));
});

afterEach(() => {
  // @ts-expect-error -- test-only teardown of the RN global this module installs onto
  delete globalThis.ErrorUtils;
});

describe('installErrorHandler', () => {
  describe('Positive', () => {
    it('reports an unhandled error and chains the previous handler', () => {
      const previousHandler = vi.fn();
      const getGlobalHandler = vi.fn(() => previousHandler);
      const setGlobalHandler = vi.fn();
      // @ts-expect-error -- ErrorUtils is a react-native global, faked for this headless test
      globalThis.ErrorUtils = { getGlobalHandler, setGlobalHandler };

      installErrorHandler();
      const installedHandler = setGlobalHandler.mock.calls[0][0];
      const error = Object.assign(new Error('boom'), { name: 'TypeError' });
      installedHandler(error, true);

      expect(reportError).toHaveBeenCalledWith({
        source: 'global',
        type: 'TypeError',
        message: 'boom',
        stacktrace: error.stack,
        isFatal: true,
      });
      expect(previousHandler).toHaveBeenCalledWith(error, true);
    });

    it('still chains the previous handler when reportError throws', () => {
      reportError.mockImplementationOnce(() => {
        throw new Error('reporting failed');
      });
      const previousHandler = vi.fn();
      const setGlobalHandler = vi.fn();
      // @ts-expect-error -- ErrorUtils is a react-native global, faked for this headless test
      globalThis.ErrorUtils = {
        getGlobalHandler: () => previousHandler,
        setGlobalHandler,
      };

      installErrorHandler();
      const installedHandler = setGlobalHandler.mock.calls[0][0];
      const error = new Error('boom');

      // `finally` guarantees the chain runs before the reporting failure propagates - the
      // previous handler must not be skipped just because recording the error blew up
      expect(() => installedHandler(error, false)).toThrow('reporting failed');
      expect(previousHandler).toHaveBeenCalledWith(error, false);
    });

    it('does nothing when ErrorUtils is undefined (web/no RN runtime)', () => {
      expect(() => installErrorHandler()).not.toThrow();
      expect(reportError).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('only installs once across repeated calls', () => {
      const setGlobalHandler = vi.fn();
      // @ts-expect-error -- ErrorUtils is a react-native global, faked for this headless test
      globalThis.ErrorUtils = {
        getGlobalHandler: () => undefined,
        setGlobalHandler,
      };

      installErrorHandler();
      installErrorHandler();

      expect(setGlobalHandler).toHaveBeenCalledTimes(1);
    });
  });
});

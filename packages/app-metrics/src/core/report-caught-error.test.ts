import { afterEach, describe, expect, it, vi } from 'vitest';

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock('./app-metrics', () => ({ reportError }));

const { reportCaughtError } = await import('./report-caught-error');

afterEach(() => vi.clearAllMocks());

describe('reportCaughtError', () => {
  describe('Positive', () => {
    it('reports an Error with its name, message, and stack', () => {
      const error = new Error('boom');
      reportCaughtError(error);

      expect(reportError).toHaveBeenCalledWith({
        source: 'errorBoundary',
        type: 'Error',
        message: 'boom',
        stacktrace: error.stack,
        componentStack: undefined,
        isFatal: false,
      });
    });

    it('reports a falsy non-Error throw by stringifying it', () => {
      reportCaughtError(null);

      expect(reportError).toHaveBeenCalledWith({
        source: 'errorBoundary',
        type: undefined,
        message: 'null',
        stacktrace: undefined,
        componentStack: undefined,
        isFatal: false,
      });
    });

    it('forwards the component stack when given', () => {
      reportCaughtError(new Error('boom'), 'at Boom\nat App');

      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ componentStack: 'at Boom\nat App' }),
      );
    });

    it('does not let a failure inside reportError escape', () => {
      reportError.mockImplementationOnce(() => {
        throw new Error('native module blew up');
      });

      expect(() => reportCaughtError(new Error('boom'))).not.toThrow();
    });
  });
});

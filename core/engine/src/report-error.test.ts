// reportUncaughtError is the channel an adapter uses when it has caught something its framework
// would otherwise have surfaced itself. What matters is that it reaches the host EXACTLY once, by
// the route that host actually has: `global.ErrorUtils` on a native host (LogBox/redbox), plain
// console.error anywhere else.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportUncaughtError } from './report-error';

const ORIGIN = 'test render';

let consoleError: ReturnType<typeof vi.spyOn>;

// Installed and removed through Reflect/Object.assign rather than `globalThis.ErrorUtils = …`:
// react-native declares its own global `ErrorUtils` whose type lists only the two globalHandler
// members, so naming the property directly fights that declaration in any package that pulls RN's
// types in. The module under test reads it the same indirect way, for the same reason.
function installErrorUtils(reportError: unknown): void {
  Object.assign(globalThis, { ErrorUtils: { reportError } });
}

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
});

describe('Positive', () => {
  it('logs the error off a native host, where there is no reporter', () => {
    const error = new Error('boom');

    reportUncaughtError(error, { origin: ORIGIN });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][1]).toBe(error);
  });

  it('names the origin in the log line', () => {
    // Off-host there is no redbox to carry the context, so the one line has to say where the
    // error came from or it reads as an anonymous stack trace.
    reportUncaughtError(new Error('boom'), { origin: ORIGIN });

    expect(String(consoleError.mock.calls[0][0])).toContain(ORIGIN);
  });

  it('hands the error to the native reporter when the host has one', () => {
    const reportError = vi.fn();
    installErrorUtils(reportError);
    const error = new Error('boom');

    reportUncaughtError(error, { origin: ORIGIN });

    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('does not ALSO log when the native reporter took it', () => {
    // why: RN routes console.error into LogBox as well, so both channels would show the same
    // error twice - upstream's showErrorDialog returns false for exactly this reason.
    installErrorUtils(vi.fn());

    reportUncaughtError(new Error('boom'), { origin: ORIGIN });

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('attaches the component stack the way LogBox reads it', () => {
    const error = new Error('boom');

    reportUncaughtError(error, { origin: ORIGIN, componentStack: '\n    in App' });

    expect(error).toMatchObject({ componentStack: '\n    in App', isComponentError: true });
  });
});

describe('Negative', () => {
  it('wraps a thrown non-Error so the reporter still gets a message and a stack', () => {
    const reportError = vi.fn();
    installErrorUtils(reportError);

    reportUncaughtError('just a string', { origin: ORIGIN });

    const reported: unknown = reportError.mock.calls[0][0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported).toMatchObject({ message: `${ORIGIN}: just a string` });
  });

  it('still reports a frozen error, minus the component frames', () => {
    // Object.assign on a frozen object throws in strict mode; losing the frames is acceptable,
    // losing the report is not.
    const error = Object.freeze(new Error('boom'));

    expect(() => {
      reportUncaughtError(error, { origin: ORIGIN, componentStack: '\n    in App' });
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('falls back to the log when the host global exists but carries no reporter', () => {
    Object.assign(globalThis, { ErrorUtils: {} });

    reportUncaughtError(new Error('boom'), { origin: ORIGIN });

    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

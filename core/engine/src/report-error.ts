// Hand an error to the host the way React Native itself does, for the seams where an adapter
// catches something its framework would otherwise have surfaced on its own.

// RN routes an uncaught render error through ReactFiberErrorDialog -> ExceptionsManager.
// `global.ErrorUtils` is the same surface via the documented global @react-native/js-polyfills
// installs. Off a native host, console.error is the whole channel.

// This is NOT the dlog channel: dlog is DEBUG-gated and therefore the developer's; an error that
// blanked the screen has to reach the app whether or not anyone turned diagnostics on.

type IErrorReporter = (error: unknown) => void;

export type IUncaughtErrorInfo = {
  // Where the error came from, in the caller's words: 'react render', 'react error boundary'.
  // Prefixes the log line off a native host, where there is no redbox to carry the context.
  readonly origin: string;
  readonly componentStack?: string | null;
};

// Read off globalThis via Reflect, not a named identifier or an ambient declare: react-native
// ships its own `ErrorUtils` global type, so redeclaring it here breaks any package whose tsconfig
// pulls in RN's types. RN's declared shape also omits reportError, which the polyfill installs.
function nativeReporter(): IErrorReporter | null {
  const utils: unknown = Reflect.get(globalThis, 'ErrorUtils');
  if (typeof utils !== 'object' || utils === null) return null;

  const report: unknown = Reflect.get(utils, 'reportError');
  if (typeof report !== 'function') return null;

  return error => {
    Reflect.apply(report, utils, [error]);
  };
}

// A throw is not required to be an Error - a string, or null, reaches here just as easily, and
// the host's reporter wants something with a message and a stack. RN wraps the same way, via
// SyntheticError.
function toError(value: unknown, origin: string): Error {
  if (value instanceof Error) return value;
  return new Error(`${origin}: ${String(value)}`);
}

export function reportUncaughtError(
  value: unknown,
  info: IUncaughtErrorInfo,
): void {
  const error = toError(value, info.origin);

  if (info.componentStack) {
    // LogBox reads these two off the error to render the component frames; RN's own
    // ReactFiberErrorDialog sets exactly the same pair, in a try/catch because a frozen or
    // sealed error still deserves to be reported, just without the frames.
    try {
      Object.assign(error, {
        componentStack: info.componentStack,
        isComponentError: true,
      });
    } catch {
      // Reported below regardless.
    }
  }

  const report = nativeReporter();
  if (report !== null) {
    // Exactly one channel, never both: RN routes console.error into LogBox as well, so logging
    // here too would double-report every error.
    report(error);
    return;
  }

  console.error(`[symbiote] ${info.origin}:`, error);
}

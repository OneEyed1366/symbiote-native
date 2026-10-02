import { reportError } from './app-metrics';

type IErrorHandlerCallback = (error: unknown, isFatal?: boolean) => void;

type IGlobalErrorUtils = {
  getGlobalHandler(): IErrorHandlerCallback | undefined;
  setGlobalHandler(handler: IErrorHandlerCallback): void;
};

let installed = false;

// react-native ships its own ambient `ErrorUtils` global, so a package whose tsconfig pulls
// that in conflicts with a local `declare global` here (core/engine/src/report-error.ts hit
// this, TS2451) - reading it off `globalThis` through Reflect sidesteps the whole ambient type
function globalErrorUtils(): IGlobalErrorUtils | null {
  const utils: unknown = Reflect.get(globalThis, 'ErrorUtils');
  if (typeof utils !== 'object' || utils === null) return null;
  const getGlobalHandler: unknown = Reflect.get(utils, 'getGlobalHandler');
  const setGlobalHandler: unknown = Reflect.get(utils, 'setGlobalHandler');
  if (
    typeof getGlobalHandler !== 'function' ||
    typeof setGlobalHandler !== 'function'
  ) {
    return null;
  }
  return {
    getGlobalHandler: () => Reflect.apply(getGlobalHandler, utils, []),
    setGlobalHandler: handler =>
      Reflect.apply(setGlobalHandler, utils, [handler]),
  };
}

/** Wraps React Native's global `ErrorUtils` handler, chaining to whatever ran before it */
export function installErrorHandler(): void {
  if (installed) return;
  const errorUtils = globalErrorUtils();
  if (!errorUtils) return;
  installed = true;

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      const asError = error instanceof Error ? error : undefined;
      reportError({
        source: 'global',
        type: asError?.name,
        message: asError?.message ?? String(error),
        stacktrace: asError?.stack,
        isFatal: isFatal ?? false,
      });
    } finally {
      previousHandler?.(error, isFatal);
    }
  });
}

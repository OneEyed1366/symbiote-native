import { GL_ERRORS } from './gl-errors';
import { GLLoggingOption } from './types';
import type { IExpoWebGLRenderingContext } from './types';

type ILoggableGL = Pick<IExpoWebGLRenderingContext, '__expoSetLogging'>;

type IGLFunction = (...args: unknown[]) => unknown;

const MAX_STRING_LENGTH = 20;

const SET_LOGGING_KEY = '__expoSetLogging';

const wrappers = new WeakSet<IGLFunction>();

function isGLFunction(value: unknown): value is IGLFunction {
  return typeof value === 'function';
}

function constantNameOf(gl: object, value: number): string | undefined {
  for (const name in gl) {
    if (Reflect.get(gl, name) === value) return name;
  }
  return undefined;
}

// Numbers get the name of a constant that holds them, which can mislead for a size, so the
// number stays. Strings are cut because a shader is long and logging it blocks the bridge
function describeArg(gl: object, option: number, arg: unknown): string {
  if (option & GLLoggingOption.RESOLVE_CONSTANTS && typeof arg === 'number') {
    const name = constantNameOf(gl, arg);
    if (name) return `${arg} (${name})`;
  }
  const isLong = typeof arg === 'string' && arg.length > MAX_STRING_LENGTH;
  if (option & GLLoggingOption.TRUNCATE_STRINGS && isLong) {
    const lastSpace = arg.lastIndexOf(' ', MAX_STRING_LENGTH);
    return `${arg.slice(0, lastSpace >= 0 ? lastSpace : MAX_STRING_LENGTH)}...`;
  }
  return String(arg);
}

// The original `getError`, a wrapped one would log itself
function reportError(gl: object): void {
  const getError: unknown = Reflect.get(
    Reflect.getPrototypeOf(gl) ?? {},
    'getError',
  );
  if (!isGLFunction(getError)) return;
  const error = getError.call(gl);
  if (typeof error !== 'number' || error === Reflect.get(gl, 'NO_ERROR'))
    return;
  console.warn(`\x1b[31mExpoGL: Error ${GL_ERRORS[error]}\x1b[0m`);
}

function wrapMethod(
  gl: object,
  key: string,
  original: IGLFunction,
  getOption: () => number,
): void {
  const wrapper: IGLFunction = (...args) => {
    const option = getOption();
    if (option & GLLoggingOption.METHOD_CALLS) {
      const params = args.map(arg => describeArg(gl, option, arg));
      console.warn(`ExpoGL: ${key}(${params.join(', ')})`);
    }
    const result = original.apply(gl, args);
    if (option & GLLoggingOption.METHOD_CALLS)
      console.warn(`ExpoGL:   = ${String(result)}`);
    if (option & GLLoggingOption.GET_ERRORS && key !== 'getError')
      reportError(gl);
    return result;
  };
  wrappers.add(wrapper);
  Reflect.set(gl, key, wrapper);
}

function wrapMethods(gl: object, getOption: () => number): void {
  for (const [key, original] of Object.entries(
    Reflect.getPrototypeOf(gl) ?? {},
  )) {
    if (isGLFunction(original) && key !== SET_LOGGING_KEY) {
      wrapMethod(gl, key, original, getOption);
    }
  }
}

function unwrapMethods(gl: object): void {
  for (const [key, value] of Object.entries(gl)) {
    if (isGLFunction(value) && wrappers.has(value))
      Reflect.deleteProperty(gl, key);
  }
}

/** Adds `__expoSetLogging` to the context, for the logging options useful in debugging GL calls */
export function configureLogging(gl: ILoggableGL): void {
  let loggingOption: number = GLLoggingOption.DISABLED;

  gl.__expoSetLogging = (option: GLLoggingOption): void => {
    // Both on or both off needs no wrapping or unwrapping, only the new option
    if (!loggingOption !== !option) {
      if (option) wrapMethods(gl, () => loggingOption);
      else unwrapMethods(gl);
    }
    loggingOption = option;
  };
}

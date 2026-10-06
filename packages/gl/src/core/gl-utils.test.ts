import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLogging } from './gl-utils';
import { GLLoggingOption } from './types';
import type { IExpoWebGLRenderingContext } from './types';

const ERROR_ENUM = 1280;
const COLOR_BUFFER_BIT = 16384;

type IFakeContext = Pick<IExpoWebGLRenderingContext, '__expoSetLogging'> & {
  clear(mask: number): number;
  shaderSource(source: string): void;
};

// A context the way the native side builds it: methods on the prototype, constants on the object
function fakeContext(errorCode = 0): IFakeContext {
  const prototype = {
    clear: vi.fn((mask: number) => mask),
    shaderSource: vi.fn(() => undefined),
    getError: vi.fn(() => errorCode),
  };
  const gl: IFakeContext = Object.assign(Object.create(prototype), {
    COLOR_BUFFER_BIT,
    NO_ERROR: 0,
  });
  configureLogging(gl);
  return gl;
}

let output: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  output = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  output.mockRestore();
});

describe('configureLogging', () => {
  it('adds `__expoSetLogging` to the context', () => {
    expect(typeof fakeContext().__expoSetLogging).toBe('function');
  });

  it('logs a call with its parameters and result with `METHOD_CALLS`', () => {
    const gl = fakeContext();
    gl.__expoSetLogging(GLLoggingOption.METHOD_CALLS);

    gl.clear(5);

    expect(output).toHaveBeenNthCalledWith(1, 'ExpoGL: clear(5)');
    expect(output).toHaveBeenNthCalledWith(2, 'ExpoGL:   = 5');
  });

  it('still runs the original method and answers its result', () => {
    const gl = fakeContext();
    gl.__expoSetLogging(GLLoggingOption.METHOD_CALLS);

    expect(gl.clear(7)).toBe(7);
  });

  it('names the constant of a numeric parameter with `RESOLVE_CONSTANTS`', () => {
    const gl = fakeContext();
    gl.__expoSetLogging(
      GLLoggingOption.METHOD_CALLS | GLLoggingOption.RESOLVE_CONSTANTS,
    );

    gl.clear(COLOR_BUFFER_BIT);

    expect(output).toHaveBeenNthCalledWith(
      1,
      `ExpoGL: clear(${COLOR_BUFFER_BIT} (COLOR_BUFFER_BIT))`,
    );
  });

  it('cuts a long string at a space with `TRUNCATE_STRINGS`', () => {
    const gl = fakeContext();
    gl.__expoSetLogging(
      GLLoggingOption.METHOD_CALLS | GLLoggingOption.TRUNCATE_STRINGS,
    );

    gl.shaderSource('precision highp float; void main() {}');

    expect(output).toHaveBeenNthCalledWith(
      1,
      'ExpoGL: shaderSource(precision highp...)',
    );
  });

  it('reports the error `getError` answers after a call with `GET_ERRORS`', () => {
    const gl = fakeContext(ERROR_ENUM);
    gl.__expoSetLogging(GLLoggingOption.GET_ERRORS);

    gl.clear(1);

    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('INVALID ENUM'),
    );
  });

  it('stays quiet about a call that left no error', () => {
    const gl = fakeContext(0);
    gl.__expoSetLogging(GLLoggingOption.GET_ERRORS);

    gl.clear(1);

    expect(output).not.toHaveBeenCalled();
  });

  it('stops logging once it is disabled', () => {
    const gl = fakeContext();
    gl.__expoSetLogging(GLLoggingOption.METHOD_CALLS);
    gl.__expoSetLogging(GLLoggingOption.DISABLED);

    gl.clear(1);

    expect(output).not.toHaveBeenCalled();
  });

  it('changes the options without wrapping twice', () => {
    const gl = fakeContext();
    gl.__expoSetLogging(GLLoggingOption.METHOD_CALLS);
    gl.__expoSetLogging(
      GLLoggingOption.METHOD_CALLS | GLLoggingOption.RESOLVE_CONSTANTS,
    );

    gl.clear(COLOR_BUFFER_BIT);

    expect(output).toHaveBeenCalledTimes(2);
  });
});

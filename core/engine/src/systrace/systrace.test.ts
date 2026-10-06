// `Systrace.js` of RN: every call is a no-op until the host says it is tracing, then it forwards to
// the `nativeTrace*` globals under the React trace tag
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Systrace } from '../index';

const TRACE_TAG_REACT = 1 << 13;

type ITraceGlobals = Record<string, unknown>;

function installTracing(
  isTracing: boolean,
): Record<string, ReturnType<typeof vi.fn>> {
  const fakes = {
    nativeTraceIsTracing: vi.fn(() => isTracing),
    nativeTraceBeginSection: vi.fn(),
    nativeTraceEndSection: vi.fn(),
    nativeTraceBeginAsyncSection: vi.fn(),
    nativeTraceEndAsyncSection: vi.fn(),
    nativeTraceCounter: vi.fn(),
  };
  Object.assign(globalThis, fakes);
  return fakes;
}

afterEach(() => {
  const globals: ITraceGlobals = globalThis;
  for (const name of [
    'nativeTraceIsTracing',
    'nativeTraceBeginSection',
    'nativeTraceEndSection',
    'nativeTraceBeginAsyncSection',
    'nativeTraceEndAsyncSection',
    'nativeTraceCounter',
    '__RCTProfileIsProfiling',
  ]) {
    Reflect.deleteProperty(globals, name);
  }
});

describe('Systrace.isEnabled', () => {
  it('asks the host with the React tag', () => {
    const fakes = installTracing(true);

    expect(Systrace.isEnabled()).toBe(true);
    expect(fakes.nativeTraceIsTracing).toHaveBeenCalledWith(TRACE_TAG_REACT);
  });

  it('falls back to the profiling flag without a host hook', () => {
    expect(Systrace.isEnabled()).toBe(false);

    Object.assign(globalThis, { __RCTProfileIsProfiling: true });

    expect(Systrace.isEnabled()).toBe(true);
  });
});

describe('Systrace while the host is tracing', () => {
  it('forwards a section with its arguments', () => {
    const fakes = installTracing(true);
    Systrace.beginEvent('render', { screen: 'home' });
    Systrace.endEvent({ ok: 'yes' });

    expect(fakes.nativeTraceBeginSection).toHaveBeenCalledWith(
      TRACE_TAG_REACT,
      'render',
      { screen: 'home' },
    );
    expect(fakes.nativeTraceEndSection).toHaveBeenCalledWith(TRACE_TAG_REACT, {
      ok: 'yes',
    });
  });

  it('builds a lazy event name only now', () => {
    const fakes = installTracing(true);
    Systrace.beginEvent(() => 'lazy');

    expect(fakes.nativeTraceBeginSection).toHaveBeenCalledWith(
      TRACE_TAG_REACT,
      'lazy',
      undefined,
    );
  });

  it('hands out a growing cookie to async events', () => {
    const fakes = installTracing(true);
    const first = Systrace.beginAsyncEvent('load');
    const second = Systrace.beginAsyncEvent('load');
    Systrace.endAsyncEvent('load', first);

    expect(second).toBe(first + 1);
    expect(fakes.nativeTraceBeginAsyncSection).toHaveBeenCalledWith(
      TRACE_TAG_REACT,
      'load',
      first,
      undefined,
    );
    expect(fakes.nativeTraceEndAsyncSection).toHaveBeenCalledWith(
      TRACE_TAG_REACT,
      'load',
      first,
      undefined,
    );
  });

  it('forwards a counter', () => {
    const fakes = installTracing(true);
    Systrace.counterEvent('frames', 3);

    expect(fakes.nativeTraceCounter).toHaveBeenCalledWith(
      TRACE_TAG_REACT,
      'frames',
      3,
    );
  });
});

describe('Systrace while the host is not tracing', () => {
  it('forwards nothing and never builds a lazy name', () => {
    const fakes = installTracing(false);
    const name = vi.fn(() => 'lazy');
    Systrace.beginEvent(name);
    Systrace.endEvent();
    Systrace.counterEvent(name, 1);

    expect(name).not.toHaveBeenCalled();
    expect(fakes.nativeTraceBeginSection).not.toHaveBeenCalled();
    expect(fakes.nativeTraceEndSection).not.toHaveBeenCalled();
    expect(fakes.nativeTraceCounter).not.toHaveBeenCalled();
  });

  it('keeps the cookie where it was', () => {
    installTracing(false);
    const first = Systrace.beginAsyncEvent('load');

    expect(Systrace.beginAsyncEvent('load')).toBe(first);
  });
});

describe('Systrace.setEnabled', () => {
  it('is a no-op, as in RN', () => {
    expect(Systrace.setEnabled(true)).toBeUndefined();
  });
});

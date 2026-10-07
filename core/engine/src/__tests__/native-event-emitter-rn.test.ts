// `NativeEventEmitter.js` of RN: the warnings for a module without the observe counters, the
// listener count of the device bus and the `context` a listener is called with
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeEventEmitter } from '../index';

const MISSING_ADD =
  '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method.';
const MISSING_REMOVE =
  '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method.';

afterEach(() => vi.restoreAllMocks());

describe('NativeEventEmitter constructor', () => {
  it('warns about a module without `addListener`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new NativeEventEmitter({ removeListeners: () => {} } as never);

    expect(warn.mock.calls).toEqual([[MISSING_ADD]]);
  });

  it('warns about a module without `removeListeners`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new NativeEventEmitter({ addListener: () => {} } as never);

    expect(warn.mock.calls).toEqual([[MISSING_REMOVE]]);
  });

  it('warns about both when the module has neither', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new NativeEventEmitter({} as never);

    expect(warn.mock.calls).toEqual([[MISSING_ADD], [MISSING_REMOVE]]);
  });

  it('stays silent without a module or with a whole one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new NativeEventEmitter();
    new NativeEventEmitter({
      addListener: () => {},
      removeListeners: () => {},
    });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('NativeEventEmitter listeners', () => {
  it('counts the listeners of an event on the device bus', () => {
    const emitter = new NativeEventEmitter();
    const first = emitter.addListener('rnParityCount', () => {});
    emitter.addListener('rnParityCount', () => {});

    expect(emitter.listenerCount('rnParityCount')).toBe(2);

    first.remove();

    expect(emitter.listenerCount('rnParityCount')).toBe(1);
  });

  it('calls a listener with the context it was added with', () => {
    const emitter = new NativeEventEmitter();
    const context = { name: 'ctx' };
    const seen: unknown[] = [];
    emitter.addListener(
      'rnParityContext',
      function (this: unknown) {
        seen.push(this);
      },
      context,
    );
    emitter.emit('rnParityContext', 1);

    expect(seen).toEqual([context]);
  });

  it('calls a listener with every argument of an emit', () => {
    const emitter = new NativeEventEmitter();
    const seen: unknown[][] = [];
    emitter.addListener('rnParityArgs', (...args) => {
      seen.push(args);
    });
    emitter.emit('rnParityArgs', 'a', 2);

    expect(seen).toEqual([['a', 2]]);
  });
});

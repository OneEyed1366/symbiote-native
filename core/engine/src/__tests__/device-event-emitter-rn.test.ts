// `RCTDeviceEventEmitter` of RN, exported as `DeviceEventEmitter` and `NativeAppEventEmitter`: the
// device bus itself, where native emits and apps listen without a module of their own
import { describe, expect, it, vi } from 'vitest';
import {
  DeviceEventEmitter,
  NativeAppEventEmitter,
  NativeEventEmitter,
} from '../index';

describe('DeviceEventEmitter', () => {
  it('delivers an emitted event to its listeners with every argument', () => {
    const listener = vi.fn();
    DeviceEventEmitter.addListener('rnDeviceArgs', listener);
    DeviceEventEmitter.emit('rnDeviceArgs', 1, 'two');

    expect(listener).toHaveBeenCalledWith(1, 'two');
  });

  it('stops delivering once the subscription is removed', () => {
    const listener = vi.fn();
    const subscription = DeviceEventEmitter.addListener(
      'rnDeviceRemove',
      listener,
    );
    subscription.remove();
    DeviceEventEmitter.emit('rnDeviceRemove', 1);

    expect(listener).not.toHaveBeenCalled();
  });

  it('calls a listener with the context it was added with', () => {
    const context = { name: 'ctx' };
    const seen: unknown[] = [];
    DeviceEventEmitter.addListener(
      'rnDeviceContext',
      function (this: unknown) {
        seen.push(this);
      },
      context,
    );
    DeviceEventEmitter.emit('rnDeviceContext');

    expect(seen).toEqual([context]);
  });

  it('counts the listeners of an event', () => {
    DeviceEventEmitter.addListener('rnDeviceCount', () => {});
    const second = DeviceEventEmitter.addListener('rnDeviceCount', () => {});

    expect(DeviceEventEmitter.listenerCount('rnDeviceCount')).toBe(2);

    second.remove();

    expect(DeviceEventEmitter.listenerCount('rnDeviceCount')).toBe(1);
  });

  it('removes every listener of one event and leaves the others', () => {
    const gone = vi.fn();
    const kept = vi.fn();
    DeviceEventEmitter.addListener('rnDeviceOne', gone);
    DeviceEventEmitter.addListener('rnDeviceTwo', kept);
    DeviceEventEmitter.removeAllListeners('rnDeviceOne');
    DeviceEventEmitter.emit('rnDeviceOne', 1);
    DeviceEventEmitter.emit('rnDeviceTwo', 1);

    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('removes every listener of every event without an argument', () => {
    const listener = vi.fn();
    DeviceEventEmitter.addListener('rnDeviceAllA', listener);
    DeviceEventEmitter.addListener('rnDeviceAllB', listener);
    DeviceEventEmitter.removeAllListeners();
    DeviceEventEmitter.emit('rnDeviceAllA', 1);
    DeviceEventEmitter.emit('rnDeviceAllB', 1);

    expect(listener).not.toHaveBeenCalled();
  });

  it('shares its bus with a NativeEventEmitter', () => {
    const listener = vi.fn();
    new NativeEventEmitter().addListener('rnDeviceShared', listener);
    DeviceEventEmitter.emit('rnDeviceShared', 7);

    expect(listener).toHaveBeenCalledWith(7);
  });
});

describe('addListener with a non-function', () => {
  const MESSAGE =
    'EventEmitter.addListener(...): 2nd argument must be a function.';
  const notAFunction: unknown = 'listener';

  it('throws the TypeError of RN from DeviceEventEmitter', () => {
    expect(() =>
      Reflect.apply(DeviceEventEmitter.addListener, DeviceEventEmitter, [
        'rnDeviceBad',
        notAFunction,
      ]),
    ).toThrow(new TypeError(MESSAGE));
  });

  it('throws it from NativeEventEmitter too, and registers nothing', () => {
    const emitter = new NativeEventEmitter();

    expect(() =>
      Reflect.apply(emitter.addListener, emitter, [
        'rnNativeBad',
        notAFunction,
      ]),
    ).toThrow(new TypeError(MESSAGE));
    expect(DeviceEventEmitter.listenerCount('rnNativeBad')).toBe(0);
  });
});

describe('NativeAppEventEmitter', () => {
  it('is the same emitter, as in RN', () => {
    expect(NativeAppEventEmitter).toBe(DeviceEventEmitter);
  });
});

// RN's Android `BackHandler` reached through the host, over the DeviceEventManager that
// vitest.config.ts stubs. It never throws, so there is no Negative group

import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitRnDeviceEvent } from '../../../test-utils/src/rn-device-event';
import { BackHandler } from '../react-native-host';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BackHandler', () => {
  it('lets the last registered handler that returns true consume the press', () => {
    const exitApp = vi.spyOn(BackHandler, 'exitApp');
    const calls: string[] = [];
    const first = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('first');
      return false;
    });
    const second = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('second');
      return true;
    });

    emitRnDeviceEvent('hardwareBackPress', undefined);

    expect(calls).toEqual(['second']);
    expect(exitApp).not.toHaveBeenCalled();
    first.remove();
    second.remove();
  });

  it('runs every handler last-first and exits the app when nobody consumes', () => {
    const exitApp = vi.spyOn(BackHandler, 'exitApp');
    const calls: string[] = [];
    const earlier = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('earlier');
      return false;
    });
    const later = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('later');
    });

    emitRnDeviceEvent('hardwareBackPress', undefined);

    expect(calls).toEqual(['later', 'earlier']);
    expect(exitApp).toHaveBeenCalledOnce();
    earlier.remove();
    later.remove();
  });

  it('exits the app with no handler at all, once the host loaded BackHandler', () => {
    const exitApp = vi.spyOn(BackHandler, 'exitApp');

    emitRnDeviceEvent('hardwareBackPress', undefined);

    expect(exitApp).toHaveBeenCalledOnce();
  });

  it('stops asking a handler once it is removed', () => {
    const exitApp = vi.spyOn(BackHandler, 'exitApp');
    const handler = vi.fn(() => true);
    BackHandler.addEventListener('hardwareBackPress', handler).remove();

    emitRnDeviceEvent('hardwareBackPress', undefined);

    expect(handler).not.toHaveBeenCalled();
    expect(exitApp).toHaveBeenCalledOnce();
  });

  it('hands the handler a hardwareBackPress event with the native timestamp', () => {
    let event: unknown;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      received => {
        event = received;
        return true;
      },
    );

    emitRnDeviceEvent('hardwareBackPress', { timeStamp: 1_234 });

    expect(event).toMatchObject({
      type: 'hardwareBackPress',
      timeStamp: 1_234,
    });
    subscription.remove();
  });
});

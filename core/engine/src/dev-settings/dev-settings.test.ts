// RN's own `DevSettings` through the host, `DevSettings` native module recorded by vitest.config.ts
// NOTE: RN keeps its menu logic inside `if (__DEV__)`, so a release bundle is a separate import

import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitRnDeviceEvent } from '../../../test-utils/src/rn-device-event';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { DevSettings } from '../react-native-host';

const RN_DEV_SETTINGS = 'react-native/Libraries/Utilities/DevSettings';

function callsTo(method: string) {
  return nativeCallsTo('DevSettings').filter(call => call.method === method);
}

afterEach(() => {
  Reflect.set(globalThis, '__DEV__', true);
});

describe('DevSettings.addMenuItem', () => {
  it('registers the title with native and runs the handler on its press', () => {
    const handler = vi.fn();
    DevSettings.addMenuItem('Clear cache', handler);
    emitRnDeviceEvent('didPressMenuItem', { title: 'Clear cache' });

    expect(callsTo('addMenuItem').at(-1)?.args).toEqual(['Clear cache']);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores the press of another item', () => {
    const handler = vi.fn();
    DevSettings.addMenuItem('Show logs', handler);
    emitRnDeviceEvent('didPressMenuItem', { title: 'Other' });

    expect(handler).not.toHaveBeenCalled();
  });

  // The title is the id, so a hot-reloaded module adding it again must not double up
  it('replaces the handler of a title added twice and tells native once', () => {
    const first = vi.fn();
    const second = vi.fn();
    const before = callsTo('addMenuItem').length;
    DevSettings.addMenuItem('Toggle flag', first);
    DevSettings.addMenuItem('Toggle flag', second);
    emitRnDeviceEvent('didPressMenuItem', { title: 'Toggle flag' });

    expect(callsTo('addMenuItem')).toHaveLength(before + 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('DevSettings.reload', () => {
  it('passes the reason to native', () => {
    DevSettings.reload('because');

    expect(callsTo('reloadWithReason').at(-1)?.args).toEqual(['because']);
  });

  it('names the reason itself when none is given', () => {
    DevSettings.reload();

    expect(callsTo('reloadWithReason').at(-1)?.args).toEqual([
      'Uncategorized from JS',
    ]);
  });
});

describe('DevSettings.onFastRefresh', () => {
  it('forwards to native', () => {
    const before = callsTo('onFastRefresh').length;
    DevSettings.onFastRefresh();

    expect(callsTo('onFastRefresh')).toHaveLength(before + 1);
  });
});

describe('DevSettings in a release bundle', () => {
  it('does nothing and never reaches native', async () => {
    Reflect.set(globalThis, '__DEV__', false);
    vi.resetModules();
    const { default: release } = await import(
      /* @vite-ignore */ RN_DEV_SETTINGS
    );
    const before = nativeCallsTo('DevSettings').length;

    release.addMenuItem('Clear cache', vi.fn());
    release.reload('because');
    release.onFastRefresh();

    expect(nativeCallsTo('DevSettings')).toHaveLength(before);
  });
});

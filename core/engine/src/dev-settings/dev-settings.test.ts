// `DevSettings.js` of RN: a dev-only bridge to the native developer menu, a no-op in release
// A fake `nativeModuleProxy` stands for the host and a fake `RN$registerCallableModule` for the hub
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

let DevSettings: typeof import('./index').DevSettings;
let deviceHub: IDeviceHub | undefined;
let native: Record<string, ReturnType<typeof vi.fn>>;

async function loadWith(options: {
  isDev: boolean;
  withReason: boolean;
}): Promise<void> {
  native = {
    reload: vi.fn(),
    addMenuItem: vi.fn(),
    onFastRefresh: vi.fn(),
    addListener: vi.fn(),
    removeListeners: vi.fn(),
  };
  if (options.withReason) native.reloadWithReason = vi.fn();
  deviceHub = undefined;
  Reflect.set(globalThis, '__DEV__', options.isDev);
  globalThis.nativeModuleProxy = { DevSettings: native };
  globalThis.RN$registerCallableModule = (name, factory): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };
  vi.resetModules();
  ({ DevSettings } = await import('./index'));
}

beforeEach(() => loadWith({ isDev: true, withReason: true }));

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
  Reflect.deleteProperty(globalThis, '__DEV__');
});

describe('DevSettings.addMenuItem', () => {
  it('registers the title with native and runs the handler on its press', () => {
    const handler = vi.fn();
    DevSettings.addMenuItem('Clear cache', handler);
    deviceHub?.emit('didPressMenuItem', { title: 'Clear cache' });

    expect(native.addMenuItem).toHaveBeenCalledWith('Clear cache');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores the press of another item', () => {
    const handler = vi.fn();
    DevSettings.addMenuItem('Clear cache', handler);
    deviceHub?.emit('didPressMenuItem', { title: 'Other' });

    expect(handler).not.toHaveBeenCalled();
  });

  // The title is the id, so a hot-reloaded module adding it again must not double up
  it('replaces the handler of a title added twice and tells native once', () => {
    const first = vi.fn();
    const second = vi.fn();
    DevSettings.addMenuItem('Clear cache', first);
    DevSettings.addMenuItem('Clear cache', second);
    deviceHub?.emit('didPressMenuItem', { title: 'Clear cache' });

    expect(native.addMenuItem).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('DevSettings.reload', () => {
  it('passes the reason when native takes one', () => {
    DevSettings.reload('because');

    expect(native.reloadWithReason).toHaveBeenCalledWith('because');
    expect(native.reload).not.toHaveBeenCalled();
  });

  it('names the reason itself when none is given', () => {
    DevSettings.reload();

    expect(native.reloadWithReason).toHaveBeenCalledWith(
      'Uncategorized from JS',
    );
  });

  it('falls back to the plain reload without `reloadWithReason`', async () => {
    await loadWith({ isDev: true, withReason: false });
    DevSettings.reload('because');

    expect(native.reload).toHaveBeenCalledTimes(1);
  });
});

describe('DevSettings.onFastRefresh', () => {
  it('forwards to native', () => {
    DevSettings.onFastRefresh();

    expect(native.onFastRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('DevSettings in a release bundle', () => {
  it('does nothing and never reaches native', async () => {
    await loadWith({ isDev: false, withReason: true });
    DevSettings.addMenuItem('Clear cache', vi.fn());
    DevSettings.reload('because');
    DevSettings.onFastRefresh();

    expect(native.addMenuItem).not.toHaveBeenCalled();
    expect(native.reloadWithReason).not.toHaveBeenCalled();
    expect(native.onFastRefresh).not.toHaveBeenCalled();
  });
});

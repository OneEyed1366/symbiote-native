// `DevSettings.js` of RN: a dev-only bridge to the native developer menu, a no-op in release

import {
  installDeviceEventHub,
  NativeEventEmitter,
  type IEventSubscription,
} from '../native-events';
import { getEnforcingNativeModule } from '../native-modules';
import { Platform } from '../platform';
import { isDevBuild } from '../platform/shared';

const NATIVE_MODULE = 'DevSettings';
const MENU_ITEM_PRESSED = 'didPressMenuItem';
const DEFAULT_RELOAD_REASON = 'Uncategorized from JS';

type INativeDevSettings = {
  reload(): void;
  reloadWithReason?(reason: string): void;
  onFastRefresh?(): void;
  addMenuItem(title: string): void;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
};

export type IDevSettings = {
  // The title is the id of the item, so it must be unique
  addMenuItem(title: string, handler: () => unknown): void;
  reload(reason?: string): void;
  onFastRefresh(): void;
};

function createDevMenu(): IDevSettings {
  const native = getEnforcingNativeModule<INativeDevSettings>(NATIVE_MODULE);
  installDeviceEventHub();
  // RN hands the module to the emitter on iOS only, where it counts the observers
  const emitter = new NativeEventEmitter(
    Platform.select({ ios: native, default: undefined }),
  );
  const subscriptions = new Map<string, IEventSubscription>();

  return {
    addMenuItem(title, handler) {
      // A hot reload adds the same title again, it must not register twice
      const previous = subscriptions.get(title);
      if (previous === undefined) native.addMenuItem(title);
      else previous.remove();
      subscriptions.set(
        title,
        emitter.addListener(MENU_ITEM_PRESSED, event => {
          if (Reflect.get(Object(event), 'title') === title) handler();
        }),
      );
    },
    reload(reason) {
      if (native.reloadWithReason === undefined) native.reload();
      else native.reloadWithReason(reason ?? DEFAULT_RELOAD_REASON);
    },
    onFastRefresh() {
      native.onFastRefresh?.();
    },
  };
}

const noop: IDevSettings = {
  addMenuItem() {},
  reload() {},
  onFastRefresh() {},
};

// The native module resolves on the first call, so importing this stays free of native side effects
let devMenu: IDevSettings | undefined;
const menu = (): IDevSettings => (devMenu ??= createDevMenu());

export const DevSettings: IDevSettings = isDevBuild()
  ? {
      addMenuItem: (title, handler) => menu().addMenuItem(title, handler),
      reload: reason => menu().reload(reason),
      onFastRefresh: () => menu().onFastRefresh(),
    }
  : noop;

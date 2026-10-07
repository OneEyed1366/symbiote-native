// The focused route's emitter for a fixed-list navigator (Tab, Drawer), with its focus and blur
// events. Both paint their own chrome in JS, so no native appear event exists to use

import { untracked } from '@angular/core';
import { dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createNavigationEmitter,
  diffFocusedRoute,
} from '../core';
import type { INavigationEmitter, IRoute } from '../core';

// Read from a tracked template binding, hence `untracked`: a signal write there throws NG600
// The new screen is built after the binding runs, so its `focus` waits a microtask to find it
export function createFocusedEmitter(
  label: string,
  readFocusedRoute: () => IRoute<unknown> | undefined,
) {
  let currentKey: string | undefined;
  let currentEmitter: INavigationEmitter | undefined;

  return {
    emitter(): INavigationEmitter {
      const key = readFocusedRoute()?.key;
      return untracked(() => {
        if (key === currentKey && currentEmitter) return currentEmitter;
        const { blurKey, focusKey } = diffFocusedRoute(currentKey, key);
        if (blurKey !== undefined && currentEmitter) {
          dlog(`${label}: previous route blurred`);
          currentEmitter.emit(NAVIGATION_EVENT_BLUR);
        }
        const emitter = createNavigationEmitter();
        currentEmitter = emitter;
        currentKey = key;
        if (focusKey !== undefined) {
          queueMicrotask(() => {
            // Superseded by a later switch
            if (currentEmitter !== emitter) return;
            dlog(`${label}: route "${readFocusedRoute()?.name}" focused`);
            emitter.emit(NAVIGATION_EVENT_FOCUS);
          });
        }
        return emitter;
      });
    },
    // The last focused screen gets its `blur` when the navigator itself goes away
    dispose(): void {
      currentEmitter?.emit(NAVIGATION_EVENT_BLUR);
    },
  };
}

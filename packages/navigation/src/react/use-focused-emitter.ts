// Focus and blur of the focused route of a fixed-list navigator (Tab, Drawer), as mount and cleanup

import { useEffect, useMemo } from 'react';
import { dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createNavigationEmitter,
} from '../core';
import type { INavigationEmitter } from '../core';

// Only the focused screen is mounted, so one fresh emitter per focus change is enough
// There is no native appear event to hook, hence mount = focus and cleanup = blur
export function useFocusedEmitter(
  focusedRouteKey: string | undefined,
  label: string,
): INavigationEmitter {
  // The key is only an invalidation signal, as the emitter takes no arguments
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emitter = useMemo(() => createNavigationEmitter(), [focusedRouteKey]);

  useEffect(() => {
    if (focusedRouteKey === undefined) return undefined;
    dlog(`${label}: route "${focusedRouteKey}" focused`);
    emitter.emit(NAVIGATION_EVENT_FOCUS);
    return () => {
      dlog(`${label}: route "${focusedRouteKey}" blurred`);
      emitter.emit(NAVIGATION_EVENT_BLUR);
    };
  }, [emitter, focusedRouteKey, label]);

  return emitter;
}

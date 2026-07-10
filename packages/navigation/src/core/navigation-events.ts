// The framework-agnostic half of what @react-navigation exposes as `navigation.addListener` /
// `useFocusEffect` / `useIsFocused` / `useNavigationState`: a plain pub/sub emitter, zero React.
// addListener is NOT React-specific there either — React's hooks are thin useEffect wrappers
// around exactly this subscribe/unsubscribe shape (confirmed against the 8.x docs: `const
// unsubscribe = navigation.addListener('focus', cb); return unsubscribe;` inside a bare
// `useEffect`). One emitter per route (created by the adapter, e.g. stack.ts's per-route
// `emitters` map) carries that route's own focus/blur/state lifecycle; every adapter's lifecycle
// hooks subscribe to it, matching this file's single responsibility split from `constants.ts`
// (which only names Fabric view/prop-key strings, not this JS-only event system).

import { dlog } from '@symbiote-native/engine';

export const NAVIGATION_EVENT_FOCUS = 'focus';
export const NAVIGATION_EVENT_BLUR = 'blur';
export const NAVIGATION_EVENT_STATE = 'state';
export const NAVIGATION_EVENT_BEFORE_REMOVE = 'beforeRemove';

export type INavigationEventName =
  | typeof NAVIGATION_EVENT_FOCUS
  | typeof NAVIGATION_EVENT_BLUR
  | typeof NAVIGATION_EVENT_STATE
  | typeof NAVIGATION_EVENT_BEFORE_REMOVE;

export type INavigationEventListener<TData = unknown> = (data: TData) => void;

export type INavigationEmitter = {
  emit: (event: INavigationEventName, data?: unknown) => void;
  addListener: (event: INavigationEventName, listener: INavigationEventListener) => () => void;
};

export function createNavigationEmitter(): INavigationEmitter {
  const listenersByEvent = new Map<INavigationEventName, Set<INavigationEventListener>>();

  function addListener(
    event: INavigationEventName,
    listener: INavigationEventListener,
  ): () => void {
    let listeners = listenersByEvent.get(event);
    if (!listeners) {
      listeners = new Set();
      listenersByEvent.set(event, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
    };
  }

  function emit(event: INavigationEventName, data?: unknown): void {
    const listeners = listenersByEvent.get(event);
    // Investigation instrumentation (flicker-on-focus bug): every emission, whether or not a
    // listener is attached, so the log stream shows if focus/blur ever fires with 0 subscribers
    // (a silent no-op) vs racing an actual effect. Kept behind DEBUG, never removed.
    dlog(
      `Navigation emitter: emit "${event}" (${listeners?.size ?? 0} listener(s)) at t=${Date.now()}`,
    );
    if (!listeners) return;
    for (const listener of listeners) listener(data);
  }

  return { emit, addListener };
}

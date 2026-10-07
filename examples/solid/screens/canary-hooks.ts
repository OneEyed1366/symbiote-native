import { createSignal, onCleanup, onMount } from 'solid-js';
import type { Accessor } from 'solid-js';
import { AppState, KEYBOARD_EVENT, Keyboard } from '@symbiote-native/solid';
import { REFRESH_MS } from './canary-shared';

function keyboardHeightOf(payload: unknown): number {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('endCoordinates' in payload)
  ) {
    return 0;
  }
  const frame = payload.endCoordinates;
  if (typeof frame !== 'object' || frame === null || !('height' in frame)) {
    return 0;
  }
  return typeof frame.height === 'number' ? frame.height : 0;
}

// native -> JS: the device hub pushes keyboard frames, the height is read live
export function createKeyboardHeight(): Accessor<number> {
  const [height, setHeight] = createSignal(0);
  onMount(() => {
    const onShow = (payload: unknown) => setHeight(keyboardHeightOf(payload));
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => setHeight(0)),
    ];
    onCleanup(() =>
      subscriptions.forEach(subscription => subscription.remove()),
    );
  });
  return height;
}

// native -> JS: AppState pushes lifecycle changes, the current phase is read live
export function createAppPhase(): Accessor<string> {
  const [phase, setPhase] = createSignal<string>(
    AppState.currentState ?? 'unknown',
  );
  onMount(() => {
    const subscription = AppState.addEventListener(
      'change',
      (...args: unknown[]) => {
        const next = args[0];
        if (typeof next === 'string') setPhase(next);
      },
    );
    onCleanup(() => subscription.remove());
  });
  return phase;
}

export function createPullRefresh() {
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [refreshes, setRefreshes] = createSignal(0);
  const onRefresh = (): void => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setRefreshes(value => value + 1);
    }, REFRESH_MS);
  };
  return { isRefreshing, refreshes, onRefresh };
}

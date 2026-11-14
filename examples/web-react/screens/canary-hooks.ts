import { useCallback, useEffect, useState } from 'react';
import { AppState, KEYBOARD_EVENT, Keyboard } from '@symbiote-native/react';
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
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const onShow = (payload: unknown) => setHeight(keyboardHeightOf(payload));
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => setHeight(0)),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);
  return height;
}

// native -> JS: AppState pushes lifecycle changes, the current phase is read live
export function useAppPhase(): string {
  const [phase, setPhase] = useState<string>(
    AppState.currentState ?? 'unknown',
  );
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (...args: unknown[]) => {
        const next = args[0];
        if (typeof next === 'string') setPhase(next);
      },
    );
    return () => subscription.remove();
  }, []);
  return phase;
}

export function usePullRefresh() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshes, setRefreshes] = useState(0);
  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setRefreshes(value => value + 1);
    }, REFRESH_MS);
  }, []);
  return { isRefreshing, refreshes, onRefresh };
}

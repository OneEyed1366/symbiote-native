import { AppState, KEYBOARD_EVENT, Keyboard } from '@symbiote-native/svelte';
import { REFRESH_MS, keyboardHeightOf } from './canary-shared';

// native -> JS: the device hub pushes keyboard frames, the height is read live
export function useKeyboardHeight(): { readonly current: number } {
  let height = $state(0);
  $effect(() => {
    const onShow = (payload: unknown): void => {
      height = keyboardHeightOf(payload);
    };
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => (height = 0)),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  });
  return {
    get current() {
      return height;
    },
  };
}

// native -> JS: AppState pushes lifecycle changes, the current phase is read live
export function useAppPhase(): { readonly current: string } {
  let phase = $state<string>(AppState.currentState ?? 'unknown');
  $effect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (...args: unknown[]) => {
        const next = args[0];
        if (typeof next === 'string') phase = next;
      },
    );
    return () => subscription.remove();
  });
  return {
    get current() {
      return phase;
    },
  };
}

export function usePullRefresh() {
  let isRefreshing = $state(false);
  let refreshes = $state(0);
  const onRefresh = (): void => {
    isRefreshing = true;
    setTimeout(() => {
      isRefreshing = false;
      refreshes += 1;
    }, REFRESH_MS);
  };
  return {
    get isRefreshing() {
      return isRefreshing;
    },
    get refreshes() {
      return refreshes;
    },
    onRefresh,
  };
}

import { onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { AppState, KEYBOARD_EVENT, Keyboard } from '@symbiote-native/vue';
import { REFRESH_MS, keyboardHeightOf } from './canary-shared';

// native -> JS: the device hub pushes keyboard frames, the height is read live
export function useKeyboardHeight(): Ref<number> {
  const height = ref(0);
  let subscriptions: Array<{ remove(): void }> = [];
  onMounted(() => {
    const onShow = (payload: unknown): void => {
      height.value = keyboardHeightOf(payload);
    };
    subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => {
        height.value = 0;
      }),
    ];
  });
  onUnmounted(() =>
    subscriptions.forEach(subscription => subscription.remove()),
  );
  return height;
}

// native -> JS: AppState pushes lifecycle changes, the current phase is read live
export function useAppPhase(): Ref<string> {
  const phase = ref<string>(AppState.currentState ?? 'unknown');
  let subscription: { remove(): void } | undefined;
  onMounted(() => {
    subscription = AppState.addEventListener('change', (...args: unknown[]) => {
      const next = args[0];
      if (typeof next === 'string') phase.value = next;
    });
  });
  onUnmounted(() => subscription?.remove());
  return phase;
}

export function usePullRefresh() {
  const isRefreshing = ref(false);
  const refreshes = ref(0);
  const onRefresh = (): void => {
    isRefreshing.value = true;
    setTimeout(() => {
      isRefreshing.value = false;
      refreshes.value += 1;
    }, REFRESH_MS);
  };
  return { isRefreshing, refreshes, onRefresh };
}

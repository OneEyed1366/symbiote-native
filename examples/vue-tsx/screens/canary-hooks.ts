import { onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { AppState, KEYBOARD_EVENT, Keyboard } from '@symbiote-native/vue';
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

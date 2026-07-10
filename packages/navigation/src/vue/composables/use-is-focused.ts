// Thin subscription wrapper: subscribes to the route's focus/blur pair and returns whether it's
// currently focused, updating reactively on change — mirrors @react-navigation's useIsFocused.
// Starts `false` rather than guessing from stack position: the route's emitter only fires 'focus'
// once RNSScreen's native onAppear actually lands (stack.ts) / once the screen mounts focused
// (tabs.ts/drawer.ts), so a screen genuinely isn't focused yet at the instant it mounts — same
// async gap real native transitions have. The Vue twin of react/hooks/use-is-focused.ts:
// onMounted/onUnmounted here play the role of React's mount-once useEffect (see
// useColorScheme/useWindowDimensions for the same top-level-hooks shape this composable follows).

import { onMounted, onUnmounted, ref } from '@vue/runtime-core';
import type { Ref } from '@vue/runtime-core';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { injectNavigationScope } from '../navigation-context';

export function useIsFocused(): Ref<boolean> {
  const scope = injectNavigationScope();
  if (scope === undefined) {
    throw new Error(
      'useIsFocused must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
    );
  }
  const isFocused = ref(false);
  let unsubscribeFocus: (() => void) | undefined;
  let unsubscribeBlur: (() => void) | undefined;

  onMounted(() => {
    const { emitter } = scope.value;
    unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, () => {
      isFocused.value = true;
    });
    unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, () => {
      isFocused.value = false;
    });
  });

  onUnmounted(() => {
    unsubscribeFocus?.();
    unsubscribeBlur?.();
  });

  return isFocused;
}

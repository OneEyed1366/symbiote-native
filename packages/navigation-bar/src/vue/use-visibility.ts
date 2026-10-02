import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import type { EventSubscription } from 'expo-modules-core';
import { addVisibilityListener, getVisibilityAsync } from '../core';
import type { INavigationBarVisibility } from '../core';

/** Statefully tracks the system navigation bar's visibility, `null` during async initialization */
export function useVisibility(): Ref<INavigationBarVisibility | null> {
  const visibility = ref<INavigationBarVisibility | null>(null);
  let subscription: EventSubscription | undefined;
  let isMounted = false;

  onMounted(() => {
    isMounted = true;
    getVisibilityAsync().then(value => {
      if (isMounted) visibility.value = value;
    });
    subscription = addVisibilityListener(({ visibility: next }) => {
      if (isMounted) visibility.value = next;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
    isMounted = false;
  });

  return visibility;
}

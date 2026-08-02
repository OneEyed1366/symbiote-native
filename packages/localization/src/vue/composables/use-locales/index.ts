// Vue lifecycle wiring over the framework-agnostic core (core/localization.ts). Unlike
// packages/network's use-network-state (which seeds a placeholder and fetches asynchronously in
// onMounted), getLocales() is a synchronous native call, so the ref is computed once, directly at
// setup — onMounted only wires the change listener, mirroring use-network-state's
// onMounted/onUnmounted subscription shape otherwise.
import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import { addLocaleListener, getLocales, type EventSubscription, type Locale } from '../../../core';

export function useLocales(): Ref<Locale[]> {
  const locales = ref<Locale[]>(getLocales());
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    subscription = addLocaleListener(() => {
      locales.value = getLocales();
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return locales;
}

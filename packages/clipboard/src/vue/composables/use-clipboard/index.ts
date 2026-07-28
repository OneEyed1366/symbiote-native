// Vue lifecycle wiring over the framework-agnostic addClipboardListener subscription (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/vue/src/composables and the
// onMounted/onUnmounted shape of @symbiote-native/sensors' useAccelerometer composable, adjusted
// for clipboard's single always-on subscription (no per-call config to resubscribe on).

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import { addClipboardListener, type EventSubscription, type IClipboardEvent } from '../../../core';

export function useClipboard(): Ref<IClipboardEvent | null> {
  // A plain ref: the value is a POJO clipboard event, not an engine node, so no shallowRef needed.
  const event = ref<IClipboardEvent | null>(null);
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    subscription = addClipboardListener(next => {
      event.value = next;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return event;
}

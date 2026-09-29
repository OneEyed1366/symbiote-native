import { computed, type ComputedRef, type ShallowRef } from '@vue/runtime-core';
import { createEventValueHook } from '@symbiote-native/vue';
import { createIncomingShareHook } from '../core/incoming-share-hook';
import type {
  IIncomingShareSnapshot,
  IUseIncomingShareResult,
} from '../core/types';

/** Vue twin of `expo-sharing`'s `useIncomingShare` */
export const useIncomingShare = createIncomingShareHook<
  ShallowRef<IIncomingShareSnapshot>,
  ComputedRef<IUseIncomingShareResult>
>(createEventValueHook, box => box.value, computed);

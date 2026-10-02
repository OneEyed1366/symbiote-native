import { createEventValueHook } from '@symbiote-native/svelte/runes/create-event-value-hook';
import { createIncomingShareHook } from '../core/incoming-share-hook';
import type {
  IIncomingShareSnapshot,
  IUseIncomingShareResult,
} from '../core/types';

type IBox<TValue> = { readonly current: TValue };

/** Svelte twin of `expo-sharing`'s `useIncomingShare` */
export const useIncomingShare = createIncomingShareHook<
  IBox<IIncomingShareSnapshot>,
  IBox<IUseIncomingShareResult>
>(
  createEventValueHook,
  box => box.current,
  compute => ({
    get current(): IUseIncomingShareResult {
      return compute();
    },
  }),
);

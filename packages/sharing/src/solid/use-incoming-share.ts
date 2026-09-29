import { createMemo, type Accessor } from 'solid-js';
import { createEventValueHook } from '@symbiote-native/solid';
import { createIncomingShareHook } from '../core/incoming-share-hook';
import type {
  IIncomingShareSnapshot,
  IUseIncomingShareResult,
} from '../core/types';

/** Solid twin of `expo-sharing`'s `useIncomingShare` */
export const useIncomingShare = createIncomingShareHook<
  Accessor<IIncomingShareSnapshot>,
  Accessor<IUseIncomingShareResult>
>(createEventValueHook, box => box(), createMemo);

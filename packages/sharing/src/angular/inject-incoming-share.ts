import { computed, type Signal } from '@angular/core';
import { createEventValueHook } from '@symbiote-native/angular';
import { createIncomingShareHook } from '../core/incoming-share-hook';
import type {
  IIncomingShareSnapshot,
  IUseIncomingShareResult,
} from '../core/types';

/** Angular twin of `expo-sharing`'s `useIncomingShare`, call it in an injection context */
export const injectIncomingShare = createIncomingShareHook<
  Signal<IIncomingShareSnapshot>,
  Signal<IUseIncomingShareResult>
>(createEventValueHook, box => box(), computed);

import { useState } from 'react';
import { createEventValueHook } from '@symbiote-native/react';
import {
  createIncomingShareStore,
  INCOMING_SHARE_CHANGE,
} from '../core/incoming-share-store';
import { withShareActions } from '../core/incoming-share-result';
import type { IIncomingShareStore } from '../core/incoming-share-store';
import type {
  IIncomingShareSnapshot,
  IUseIncomingShareResult,
} from '../core/types';

const useShareSnapshot = createEventValueHook<
  IIncomingShareStore,
  IIncomingShareSnapshot,
  typeof INCOMING_SHARE_CHANGE
>(INCOMING_SHARE_CHANGE, store => store.getSnapshot());

/** React twin of `expo-sharing`'s `useIncomingShare` */
export function useIncomingShare(): IUseIncomingShareResult {
  const [store] = useState(createIncomingShareStore);
  return withShareActions(useShareSnapshot(store), store);
}

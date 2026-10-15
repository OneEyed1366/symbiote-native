import { onScopeDispose, watch } from '@vue/runtime-core';
import { followUpdaterIn, type ITrack } from '../core/follow-reads';

// The getter hands back a new object each time, so every change it saw is a change to report
export const trackReads: ITrack = (read, onChange) =>
  watch(() => {
    read();
    return {};
  }, onChange);

export const followInScope = followUpdaterIn(trackReads, onScopeDispose);

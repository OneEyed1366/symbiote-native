import { useSyncExternalStore } from 'react';
import { createEventLog } from './event-log';

const LOG_LIMIT = 30;

// One log for the whole app, so the Events screen shows what happened while it was gone
export const navigationEventLog = createEventLog(LOG_LIMIT);

export function useEventLines() {
  return useSyncExternalStore(
    navigationEventLog.subscribe,
    navigationEventLog.snapshot,
  );
}

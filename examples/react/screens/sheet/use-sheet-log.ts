import { useSyncExternalStore } from 'react';
import { createEventLog } from '../events/event-log';

const LOG_LIMIT = 8;

// One log for the app: the sheet that wrote to it is gone by the time the panel reads it
export const sheetLog = createEventLog(LOG_LIMIT);

export function useSheetLines() {
  return useSyncExternalStore(sheetLog.subscribe, sheetLog.snapshot);
}

import { injectExternalStore } from '../use-external-store';
import { createEventLog } from './event-log';

const LOG_LIMIT = 30;

// One log for the whole app, so the Events screen shows what happened while it was gone
export const navigationEventLog = createEventLog(LOG_LIMIT);

export function injectEventLines() {
  return injectExternalStore(
    navigationEventLog.subscribe,
    navigationEventLog.snapshot,
  );
}

import type { Ref } from 'vue';

const LOG_LIMIT = 8;

// The history stays off the reactive graph: an effect that reads `log.value` and then writes it
// tracks its own output and retriggers until Vue aborts with "Maximum recursive updates exceeded"
const logHistory = new WeakMap<Ref<string[]>, string[]>();

export function pushLimited(log: Ref<string[]>, entry: string): void {
  const history = logHistory.get(log) ?? [];
  history.unshift(entry);
  history.length = Math.min(history.length, LOG_LIMIT);
  logHistory.set(log, history);
  // A fresh array, so the render sees a new value and the ref is never read back
  log.value = [...history];
}

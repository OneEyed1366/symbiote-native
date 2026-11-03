import type { Ref } from 'vue';

// Newest entry last, the oldest ones fall off once the list is `limit` long
export function appendLimited(
  log: Ref<string[]>,
  entry: string,
  limit: number,
): void {
  log.value = [...log.value, entry].slice(-limit);
}

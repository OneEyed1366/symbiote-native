import type {
  INetworkRequestCompletedEvent,
  INetworkRequestStartedEvent,
} from '@symbiote-native/app-metrics/vue';

export const DEFAULT_PROBE_URL = 'https://example.com/';

export function describeStarted(event: INetworkRequestStartedEvent): string {
  return `started ${event.method} ${event.url}`;
}

export function describeCompleted(
  event: INetworkRequestCompletedEvent,
): string {
  return `completed ${event.method} ${event.url} -> ${event.statusCode} in ${event.totalDuration}ms`;
}

export function splitList(text: string): string[] | null {
  const items = text
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return items.length === 0 ? null : items;
}

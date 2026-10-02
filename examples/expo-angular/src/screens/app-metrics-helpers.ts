import type {
  ILogAttributeValue,
  ILogSeverity,
  IReportErrorInput,
} from '@symbiote-native/app-metrics/angular';

export const SEVERITIES: readonly ILogSeverity[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];
export const SOURCES: readonly IReportErrorInput['source'][] = [
  'global',
  'errorBoundary',
  'reportedByUser',
];

export function choices<T extends string>(
  values: readonly T[],
): { label: T; value: T }[] {
  return values.map(value => ({ label: value, value }));
}

export const SEVERITY_CHOICES = choices(SEVERITIES);
export const SOURCE_CHOICES = choices(SOURCES);

export function parseAttributes(
  text: string,
): Record<string, ILogAttributeValue> | null {
  if (text.trim() === '') {
    return null;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('attributes must be a JSON object');
  }
  return Object.fromEntries(Object.entries(parsed));
}

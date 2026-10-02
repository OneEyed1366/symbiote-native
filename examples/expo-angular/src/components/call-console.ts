export type ICall = { label: string; run: () => Promise<unknown> };

const MAX_OUTPUT_CHARS = 1_200;

export function slug(label: string): string {
  return label.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '');
}

export function summarize(value: unknown): string {
  if (value === undefined) {
    return 'undefined (unsupported on this platform, or no result)';
  }
  const text = JSON.stringify(value, null, 1) ?? String(value);
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}… (${text.length} chars)`
    : text;
}

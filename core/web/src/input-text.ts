// The app's controlled write into a field: `setTextAndSelection(eventCount, text, start, end)`
// A write that has not seen the latest change is stale, and a composition is never interrupted

import type { ITextField } from './dom-guards';
import { eventCountOf, isComposing } from './input-state';

// A negative bound means leave the caret where it is, as the native command reads it
const KEEP_SELECTION = 0;

function boundOf(value: unknown): number {
  return typeof value === 'number' ? value : -1;
}

export function writeTextAndSelection(
  field: ITextField,
  handle: object,
  args: readonly unknown[],
): void {
  const [count, written, start, end] = args;
  if (typeof count === 'number' && count < eventCountOf(handle)) return;
  if (isComposing(field)) return;
  // The browser enforces `maxlength` on typing only, a script may write past it
  const text =
    typeof written === 'string' && field.maxLength >= 0
      ? written.slice(0, field.maxLength)
      : written;
  if (typeof text === 'string' && field.value !== text) {
    const caret = field.selectionStart ?? text.length;
    field.value = text;
    field.setSelectionRange(
      Math.min(caret, text.length),
      Math.min(caret, text.length),
    );
  }
  const from = boundOf(start);
  if (from < KEEP_SELECTION) return;
  const to = boundOf(end);
  field.setSelectionRange(from, to < KEEP_SELECTION ? from : to);
}

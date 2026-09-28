// JS-side port of RN's processAspectRatio: resolves a CSS ratio string ('16 / 9') to a number
// before native, same root cause as boxShadow/filter. A plain number passes through untouched.
// RN throws via invariant() on a malformed value; here we dlog and return undefined instead.

import { dlog } from './debug';

// RN processAspectRatio.js:15-63. number → number; ratio string → number; invalid → undefined.
export function processAspectRatio(
  aspectRatio: number | string | undefined,
): number | undefined {
  if (typeof aspectRatio === 'number') {
    return aspectRatio;
  }
  if (typeof aspectRatio !== 'string') {
    if (aspectRatio != null) {
      dlog(
        `processAspectRatio reject: must be a number, ratio string or "auto"`,
      );
    }
    return undefined;
  }

  const matches = aspectRatio.split('/').map(s => s.trim());

  // RN processAspectRatio.js:34-43: `auto` (and `auto <ratio>`) is not a numeric ratio.
  if (matches.includes('auto')) {
    return undefined;
  }

  const hasNonNumericValues = matches.some(n => Number.isNaN(Number(n)));
  if (hasNonNumericValues || (matches.length !== 1 && matches.length !== 2)) {
    dlog(`processAspectRatio reject: invalid ratio string "${aspectRatio}"`);
    return undefined;
  }

  if (matches.length === 2) {
    return Number(matches[0]) / Number(matches[1]);
  }

  return Number(matches[0]);
}

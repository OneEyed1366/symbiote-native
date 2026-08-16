// JS-side port of RN's processTransform (Libraries/StyleSheet/processTransform.js).
// Same root cause as transformOrigin/boxShadow: RN only parses `transform` in JS when
// nativeCSSParsing is off (the default), and only for a STRING input - an ARRAY is
// returned unchanged. symbiote forwarded a raw string once, which Android native cast
// to ReadableArray and crashed (`String cannot be cast to ReadableArray`). This
// restores the missing JS parse.
//
// CRITICAL: the animated / sticky-header hot path produces transform ARRAYS on every
// commit flush, so the array branch MUST return the byte-identical reference (no
// decompose, no clone). RN's only array-path check, _validateTransforms, is __DEV__-only
// and throws via invariant; we never throw in commit, so we dlog instead and still
// return the array unchanged.

import { dlog } from '../debug';

// RN processTransform.js:28: matches each `name(args)` in the CSS string.
const TRANSFORM_REGEX = /(\w+)\(([^)]+)\)/g;
// RN processTransform.js:59: splits one arg into [, number, , unit?].
const ARG_WITH_UNITS_REGEX = /([+-]?\d+(\.\d+)?)([a-zA-Z]+|%)?/g;
// RN processTransform.js:63: pulls every signed/decimal number out of a matrix arg list.
const MATRIX_NUMBER_REGEX = /[+-]?\d+(\.\d+)?/g;

// A single transform entry: exactly one key (rotate / translateX / matrix / …) whose
// value is a number, an angle/percentage string, or a numeric array (matrix / translate).
type ITransformEntry = Record<string, ITransformValue>;
type ITransformValue = number | string | Array<number | string> | undefined;

// The loosely-typed input shape: callers (commit) pass plain records filtered by isRecord
// (Record<string, unknown>), so the array branch reads each entry without a cast. Mirrors
// process-box-shadow's RawBoxShadow / isRecord pairing.
type IRawTransform = Record<string, unknown>;

// RN processTransform.js:52-139. Mirrors _getKeyAndValueFromCSSTransform: turns one
// `key(args)` pair into the entry value native expects.
function getKeyAndValueFromCSSTransform(
  key: string,
  args: string,
): { key: string; value: ITransformValue } {
  switch (key) {
    case 'matrix': {
      // RN processTransform.js:62-63.
      const numbers = args.match(MATRIX_NUMBER_REGEX);
      return { key, value: numbers == null ? undefined : numbers.map(Number) };
    }
    case 'translate':
    case 'translate3d': {
      // RN processTransform.js:64-113.
      const parsedArgs: Array<number | string> = [];
      ARG_WITH_UNITS_REGEX.lastIndex = 0;

      let matches: RegExpExecArray | null;
      while ((matches = ARG_WITH_UNITS_REGEX.exec(args))) {
        const value = Number(matches[1]);
        const unitOfMeasurement = matches[3];

        if (value !== 0 && !unitOfMeasurement) {
          dlog(`processTransform: ${key}(${args}) length must have a unit unless 0`);
        }

        if (unitOfMeasurement === '%') {
          parsedArgs.push(`${value}%`);
        } else {
          parsedArgs.push(value);
        }
      }

      // RN processTransform.js:109-111: a single-axis translate gets an implicit y of 0.
      if (parsedArgs.length === 1) {
        parsedArgs.push(0);
      }

      // RN normalizes translate3d down to the `translate` key.
      return { key: 'translate', value: parsedArgs };
    }
    case 'translateX':
    case 'translateY':
    case 'perspective': {
      // RN processTransform.js:114-134.
      ARG_WITH_UNITS_REGEX.lastIndex = 0;
      const argMatches = ARG_WITH_UNITS_REGEX.exec(args);

      if (argMatches == null || argMatches.length === 0) {
        return { key, value: undefined };
      }

      const value = Number(argMatches[1]);
      const unitOfMeasurement = argMatches[3];

      if (value !== 0 && !unitOfMeasurement) {
        dlog(`processTransform: ${key}(${args}) must have a unit unless 0`);
      }

      return { key, value };
    }
    default:
      // RN processTransform.js:136-137: a numeric arg (scale, rotate '10' would be NaN)
      // becomes a number; an angle string ('6deg', '1.16rad') stays a string.
      return { key, value: isNaN(Number(args)) ? args : Number(args) };
  }
}

// RN processTransform.js:24-50. String input is parsed into the entry array; array
// input is returned unchanged (see file header for why).
export function processTransform(
  transform: ReadonlyArray<IRawTransform> | string | undefined,
): ReadonlyArray<IRawTransform> {
  if (transform == null) {
    return [];
  }

  if (typeof transform !== 'string') {
    // Hot path: return the same reference, no clone (see file header).
    warnInvalidTransforms(transform);
    return transform;
  }

  TRANSFORM_REGEX.lastIndex = 0;
  const transformArray: Array<ITransformEntry> = [];

  let matches: RegExpExecArray | null;
  while ((matches = TRANSFORM_REGEX.exec(transform))) {
    const { key, value } = getKeyAndValueFromCSSTransform(matches[1], matches[2]);
    if (value !== undefined) {
      transformArray.push({ [key]: value });
    }
  }

  return transformArray;
}

// RN processTransform.js:141-159 (_validateTransforms) rewritten to NEVER throw: it only
// dlogs the same conditions RN's invariant would have flagged, then returns. The commit
// path keeps the array regardless: an invalid transform is the caller's bug, not ours to
// abort a frame over.
function warnInvalidTransforms(transform: ReadonlyArray<IRawTransform>): void {
  for (const transformation of transform) {
    const keys = Object.keys(transformation);
    if (keys.length !== 1) {
      dlog(`processTransform: each transform object must have exactly one key, got ${keys.length}`);
      continue;
    }
    if (keys[0] === 'matrix' && transform.length > 1) {
      dlog('processTransform: a matrix transform must be the only transform in the list');
    }
  }
}

export type { ITransformEntry, IRawTransform };

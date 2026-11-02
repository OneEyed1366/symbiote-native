// Form sheet detent options folded into the numbers `RNSScreen` reads, with the vendor's checks
// The checks run in development only, a release build falls back to a safe value

import { isDevBuild } from '@symbiote-native/engine';
import type {
  ISheetAllowedDetents,
  ISheetInitialDetent,
  ISheetLargestUndimmedDetent,
} from './navigator-props';
import { warnOnce } from './warn-once';

const SHEET_DIMMED_ALWAYS = -1;
const ANDROID_MAX_DETENTS = 3;

// Compat values of the legacy presets, kept in sync with the screens native side
// since we drive `RNSScreen` without its JS component
const ALLOWED_DETENT_PRESETS = {
  fitToContents: [-1],
  large: [1],
  medium: [0.5],
  all: [0.5, 1],
} as const satisfies Record<
  Exclude<ISheetAllowedDetents, number[]>,
  readonly number[]
>;

const LARGEST_UNDIMMED_PRESETS = {
  large: 1,
  medium: 0,
  none: SHEET_DIMMED_ALWAYS,
  all: SHEET_DIMMED_ALWAYS,
} as const satisfies Record<
  Exclude<ISheetLargestUndimmedDetent, number | 'last'>,
  number
>;

const ANDROID_SURPLUS_MESSAGE =
  '[RNScreens] Sheets API on Android do accept only up to 3 values. Any surplus value are ignored.';
const UNSORTED_MESSAGE =
  '[RNScreens] The detent array is not sorted in ascending order!';
const LARGEST_UNDIMMED_BOUNDS_MESSAGE =
  "[RNScreens] Provided value of 'sheetLargestUndimmedDetentIndex' prop is out of bounds of 'sheetAllowedDetents' array.";
const INITIAL_BOUNDS_MESSAGE =
  "[RNScreens] Provided value of 'sheetInitialDetentIndex' prop is out of bounds of 'sheetAllowedDetents' array.";

function isIndexInClosedRange(
  value: number,
  lowerBound: number,
  upperBound: number,
): boolean {
  return Number.isInteger(value) && value >= lowerBound && value <= upperBound;
}

function isSortedAscending(detents: number[]): boolean {
  return detents.every(
    (detent, index) => index === 0 || detents[index - 1] <= detent,
  );
}

function resolveDetentList(detents: number[], isAndroid: boolean): number[] {
  const isOverAndroidLimit = isAndroid && detents.length > ANDROID_MAX_DETENTS;
  warnOnce(isOverAndroidLimit, ANDROID_SURPLUS_MESSAGE);
  const kept = isOverAndroidLimit
    ? detents.slice(0, ANDROID_MAX_DETENTS)
    : detents;
  if (isDevBuild() && !isSortedAscending(kept)) {
    throw new Error(UNSORTED_MESSAGE);
  }
  return kept;
}

export function resolveSheetAllowedDetents(
  compat: ISheetAllowedDetents | undefined,
  isAndroid: boolean,
): number[] {
  if (compat === undefined) return [...ALLOWED_DETENT_PRESETS.large];
  if (Array.isArray(compat)) return resolveDetentList(compat, isAndroid);
  return [...ALLOWED_DETENT_PRESETS[compat]];
}

export function resolveSheetLargestUndimmedDetent(
  compat: ISheetLargestUndimmedDetent | undefined,
  lastDetentIndex: number,
): number {
  if (compat === undefined) return SHEET_DIMMED_ALWAYS;
  if (compat === 'last') return lastDetentIndex;
  if (typeof compat === 'string') return LARGEST_UNDIMMED_PRESETS[compat];
  if (isIndexInClosedRange(compat, SHEET_DIMMED_ALWAYS, lastDetentIndex)) {
    return compat;
  }
  if (isDevBuild()) throw new Error(LARGEST_UNDIMMED_BOUNDS_MESSAGE);
  return SHEET_DIMMED_ALWAYS;
}

export function resolveSheetInitialDetent(
  compat: ISheetInitialDetent | undefined,
  lastDetentIndex: number,
): number {
  const index = compat === 'last' ? lastDetentIndex : (compat ?? 0);
  if (isIndexInClosedRange(index, 0, lastDetentIndex)) return index;
  if (isDevBuild()) throw new Error(INITIAL_BOUNDS_MESSAGE);
  return 0;
}

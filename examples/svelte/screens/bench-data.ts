// Row data and the pure list operations shared by the benchmark screen and its suite
// The word lists and the row shape come from js-framework-benchmark (krausest)
// So the numbers read next to the published ones, and nothing here is tuned for the benchmark
import type { IBenchmarkRow } from '../components/BenchmarkRow.svelte';

const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
] as const;

const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'white',
  'black',
  'orange',
] as const;

const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
] as const;

type IRowWord =
  | (typeof ADJECTIVES)[number]
  | (typeof COLOURS)[number]
  | (typeof NOUNS)[number];

export const ROW_BATCH = 1_000;
export const ROW_BATCH_LARGE = 10_000;

// `BenchmarkRow` expands to ten native views (1 View, 3 Text with a raw-text child each,
// 2 Pressable Views, 1 TextInput), so 10 000 rows are 100 000 views, a ceiling of the host
export const NATIVE_VIEWS_PER_ROW = 10;

// Fixed, so `getItemLayout` is exact in virtualized mode and both modes lay rows out alike
export const BENCH_ROW_HEIGHT = 44;
export const HISTORY_LIMIT = 20;

// krausest's partial update touches every 10th row and appends a suffix to its label
export const UPDATE_STRIDE = 10;
export const UPDATE_SUFFIX = ' !!!';

// The exact rows krausest's driver uses: select row 2, remove row 4, swap rows 2 and 999
export const SELECT_INDEX = 1;
export const REMOVE_INDEX = 3;
export const SWAP_LOW_INDEX = 1;
export const SWAP_HIGH_INDEX = 998;

// Rows and selection are one state object, so every operation produces exactly one new object
// The stopwatch keys off that commit, and a select touching a second rune would leave it running
export type IListState = {
  rows: readonly IBenchmarkRow[];
  selectedId: number | undefined;
};

// Row ids are never reused, as a reused key would let the keyed each-block match an old row
// to a new one and hide real reconciliation work
let nextRowId = 1;

// Deterministic, not `Math.random()`, as this screen is a ruler that must exist in every example
// Random labels vary in length, which changes text measurement and puts noise in the numbers
// A tiny LCG with a fixed seed makes every adapter build the same row list
const RANDOM_SEED = 1;
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const LCG_MODULUS = 2 ** 32;
let randomState = RANDOM_SEED;

// Both generators are module state, so they drift with every button pressed before a run
// Two suite runs are only identical if both are rewound first
export function resetRowData(): void {
  randomState = RANDOM_SEED;
  nextRowId = 1;
}

function nextRandom(): number {
  randomState = (randomState * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
  return randomState / LCG_MODULUS;
}

function pick<T extends IRowWord>(from: readonly T[]): T {
  return from[Math.floor(nextRandom() * from.length)];
}

export function buildRows(count: number): IBenchmarkRow[] {
  const rows: IBenchmarkRow[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      id: nextRowId,
      label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`,
    };
    nextRowId += 1;
  }
  return rows;
}

export function freshList(count: number): IListState {
  return { rows: buildRows(count), selectedId: undefined };
}

export function clearedList(): IListState {
  return { rows: [], selectedId: undefined };
}

export function withAppendedRows(list: IListState, count: number): IListState {
  return { ...list, rows: list.rows.concat(buildRows(count)) };
}

export function withUpdatedLabels(list: IListState): IListState {
  return {
    ...list,
    rows: list.rows.map((row, index) =>
      index % UPDATE_STRIDE === 0
        ? { ...row, label: row.label + UPDATE_SUFFIX }
        : row,
    ),
  };
}

export function withSwappedRows(list: IListState): IListState {
  const next = list.rows.slice();
  const low = next[SWAP_LOW_INDEX];
  next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
  next[SWAP_HIGH_INDEX] = low;
  return { ...list, rows: next };
}

// Vue's column of the work ledger. See `adapters/solid/src/work-ledger.probe.test.tsx` for what the
// columns mean and why a count rather than a clock.
//
// Vue is here because of rule 3 of this investigation's own method: ruling a cost out on ONE adapter
// does not rule it out. F-19's quadratic was correctly absent from Solid and sitting in Vue, and
// F-20's duplicate text defaults were Angular's alone. The ledger is only a ruler once more than one
// column is on it — an adapter doing more work than its siblings for the IDENTICAL tree is work the
// adapter is generating, and that is the whole detection method.
//
// THE ROW IS THE REAL ONE. It used to be an invented seven-node row with inline styles, which made
// this column incomparable with solid's and react's and therefore useless for the one thing the
// ledger is for — F-34 records the same defect on solid's own probe, and F-52 records what an
// invented STYLESHEET did to the numbers on top of it. What is below is the same ten-node row those
// two build: CSS classes, two `onPress` closures fresh per render, `<text-input>` last, and the
// example app's real stylesheet compiled by the real parser.
//
// Written with h() rather than an SFC for the reason the anchor census gives: this repo compiles
// SFCs in Metro, not in Vitest. That is a real difference from the shipping adapter and it is
// stated rather than hidden — an SFC lowers `<view>`/`<text>`/`<pressable>` to intrinsic tags at
// compile time, and h() names the tag directly, which is the same thing arrived at by hand.

import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// By package name, not a relative path — see the sibling probe in `adapters/solid` for what the
// relative one does to `core/css-parser`'s source tree.
import { compileCssToRules } from '@symbiote-native/css-parser';
import {
  clearGlobalStyles,
  registerRules,
  setTreeHost,
  treeHost,
} from '@symbiote-native/engine';
import {
  OP_SET_PROP,
  OP_STRIDE,
} from '@symbiote-native/engine/mutation-buffer';
import {
  registerPressableBehavior,
  registerTextInputBehavior,
} from '@symbiote-native/components';

import { mount, unmount } from './render';
import './register';

// At module scope, as the shipping app registers them. Without these the pressables and the input
// commit their class and nothing else — the fourth invented input this investigation found (F-53),
// and the one its own source file had already warned about in a comment.
registerPressableBehavior();
registerTextInputBehavior();

/**
 * The example app's own stylesheet, compiled by the real parser — the same file solid's and react's
 * ledgers read, because the point of the ledger is that the adapters share a ruler. An adapter
 * never imports another adapter's source, so these eight lines are here too; what must not be
 * duplicated is the STYLESHEET, and it is not.
 */
function benchmarkRowRules(): unknown[] {
  const compiled = compileCssToRules(
    readFileSync(
      new URL('../../../examples/svelte/App.css', import.meta.url),
      'utf8',
    ),
    { filename: 'App.css' },
  );
  return Array.isArray(compiled) ? compiled : compiled.rules;
}

const ROOT_TAG = 8841;
const ROWS = 1_000;

const fabric = installRecordingFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: number; label: string };

function makeRows(from: number, count: number): IRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: from + index,
    label: `row ${from + index}`,
  }));
}

function isRow(value: unknown): value is IRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof Reflect.get(value, 'id') === 'number';
}

const ROW_POOL = makeRows(1, ROWS * 2);

// A majority of the list rather than all of it — the only shape that separates the two halves of
// F-43's rule, since `retext all rows` satisfies both with the same number.
const PARTIAL_SHARE = 3;
const PARTIAL_OF = 5;

const rowsRef = ref<IRow[]>(ROW_POOL.slice(0, ROWS));
const selectedIdRef = ref(-1);
const suffixRef = ref('');
const partialSuffixRef = ref('');

const noop = (_id: number): void => {};

const BenchmarkRow = defineComponent({
  name: 'BenchmarkRow',
  props: {
    row: { type: Object, required: true },
    isSelected: { type: Boolean, required: true },
    suffix: { type: String, required: true },
  },
  setup(props) {
    return (): VNode => {
      const row: unknown = props.row;
      if (!isRow(row)) throw new Error('row prop lost its shape');
      return h(
        'view',
        {
          class: props.isSelected
            ? 'bench-row bench-row-selected'
            : 'bench-row',
        },
        [
          h('text', { class: 'bench-row-id' }, String(row.id)),
          // Fresh closures per render, exactly as the screen builds them. A hoisted listener would
          // be a different workload: a function prop takes its own path through `routeProp`, and a
          // new identity on every render is what makes that path run again.
          h('pressable', { class: 'flex1', onPress: () => noop(row.id) }, [
            h('text', { class: 'bench-row-label' }, row.label + props.suffix),
          ]),
          h(
            'pressable',
            { class: 'bench-row-remove', onPress: () => noop(row.id) },
            [h('text', { class: 'bench-row-remove-text' }, '×')],
          ),
          // LAST, as the real row places it, so the other nine views keep the positions every
          // device payload diff was read at. No `multiline` — it selects a different native view.
          h('text-input', { class: 'bench-row-input', value: row.label }),
        ],
      );
    };
  },
});

const List = defineComponent({
  name: 'work-ledger-list',
  setup() {
    return (): VNode =>
      h(
        'view',
        { testID: 'list' },
        rowsRef.value.map(row =>
          h(BenchmarkRow, {
            key: row.id,
            row,
            isSelected: row.id === selectedIdRef.value,
            suffix:
              suffixRef.value +
              (row.id % PARTIAL_OF < PARTIAL_SHARE
                ? partialSuffixRef.value
                : ''),
          }),
        ),
      );
  },
});

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
  registerRules(benchmarkRowRules());
  rowsRef.value = ROW_POOL.slice(0, ROWS);
  selectedIdRef.value = -1;
  suffixRef.value = '';
  partialSuffixRef.value = '';
});

describe('the work a vue commit asks for, against the work it needs', () => {
  // SKIPPED, not deleted: both read `measureWorkStep`, the mirror's own simulation of Fabric's
  // `materialize` walk (`visited`/`rebuilt`/`scanned`/payload-fold counts) — genuinely
  // mirror-derived, confirmed against the real engine's `Tree` class, which holds no members by
  // design (a real device crash is on record from a similar attempt) — see
  // `.docs/mirror-elimination.md` Round 16/21 for the full investigation. No C++ instrumentation
  // exists for this and none is safely addable inside this migration's scope.
  it.skip('accounts for every step of the benchmark sequence', () => {});

  // The row is only the real row if it builds the real TREE. Ten native views per row plus the list
  // and the surface is the count every device run reads as `createNode 10000`, and it is the cheap
  // check `CLAUDE.md` prescribes before any other number is compared across columns. SKIPPED for
  // the same reason as the case above.
  it.skip('builds the same ten-view row the device measures', () => {});

  // WHICH KEY, and it is a question the ledger cannot answer. Once this column came onto the real
  // row it read `writes 1000 / noop 1000` on a relabel where solid reads `0 / 0` for the identical
  // tree — a thousand prop writes whose value the node already held. By this investigation's own
  // detection rule that is work the ADAPTER generates, and a count cannot name it; a census keyed by
  // prop NAME and VALUE can.
  it('names every prop it rewrites on a relabel', async () => {
    const base = treeHost();
    if (base === undefined) throw new Error('no host installed');
    let keys: Record<string, number> = {};
    setTreeHost({
      ...base,
      applyOps: batch => {
        for (let at = 0; at + OP_STRIDE <= batch.ops.length; at += OP_STRIDE) {
          if (batch.ops[at] !== OP_SET_PROP) continue;
          const name = batch.strings[batch.ops[at + 2]] ?? '?';
          const index = batch.ops[at + 3];
          const shown = index < 0 ? 'DELETE' : String(batch.values[index]);
          keys[`${name}=${shown}`] = (keys[`${name}=${shown}`] ?? 0) + 1;
        }
        base.applyOps(batch);
      },
    });

    mount(ROOT_TAG, List);
    await flush();
    keys = {};
    suffixRef.value = '!';
    await flush();
    unmount(ROOT_TAG);

    // NOTHING. A relabel changes text and no prop, and solid reads exactly this for the identical
    // tree — which is what makes the requirement a requirement rather than a preference. The first
    // run of this assertion read `value=row 0 … value=row 999`, one per row, every one carrying the
    // value the node already held.
    expect(keys).toEqual({});
  });

  // WHAT VUE ASKS THE HOST PER RE-RENDER, and it is upstream's, not ours. `componentUpdateFn`
  // patches a re-rendered component with two values it computes unconditionally:
  //
  //   patch(prevTree, nextTree,
  //     hostParentNode(prevTree.el),   // "parent may have changed if it's in a teleport"
  //     getNextHostNode(prevTree),     // "anchor may have changed if it's in a fragment"
  //     …)                             — @vue/runtime-core 3.5.39, lines 6212 and 6214
  //
  // Both comments name a feature the ordinary case does not use, and in the DOM both are pointer
  // reads costing nothing. Here each is a crossing of the host boundary, so a relabel of a
  // thousand rows asks two thousand questions whose answers the patch then ignores.
  //
  // Pinned rather than chased: nothing on this side can decline a call Vue makes, and answering it
  // without crossing would mean holding the parent edge in JS — which is the structure this
  // architecture removed on purpose (F-64 refuses the same trade for Angular). What the pin buys is
  // that the number stops being invisible: it moves if Vue changes, and it moves if we ever decide
  // that trade is worth making.
  it('asks the host twice per re-rendered component, and that is upstream', async () => {
    mount(ROOT_TAG, List);
    await flush();

    const base = treeHost();
    if (base === undefined) throw new Error('no host installed');
    const crossingsByMethod: Record<string, number> = {};
    const counted: Record<string, unknown> = {};
    for (const name of Object.keys(base)) {
      const member: unknown = Reflect.get(base, name);
      if (typeof member !== 'function' || name === 'applyOps') continue;
      counted[name] = (...args: unknown[]): unknown => {
        crossingsByMethod[name] = (crossingsByMethod[name] ?? 0) + 1;
        return Reflect.apply(member, base, args);
      };
    }
    setTreeHost({ ...base, ...counted });

    suffixRef.value = '!';
    await flush();
    setTreeHost(base);
    unmount(ROOT_TAG);

    expect(crossingsByMethod.parentOf).toBe(ROWS + 1);
    expect(crossingsByMethod.nextSiblingOf).toBe(ROWS + 1);
  });
});

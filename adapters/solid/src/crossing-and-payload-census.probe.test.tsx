// Two probes split out of work-ledger.probe.test.tsx (Round 20, `.docs/mirror-elimination.md`):
// neither reads the mirror's `applierWalk` simulation of Fabric's commit decisions — one wraps
// `treeHost()` generically to see WHICH call site crosses the host boundary, the other reads the
// real folded payload of every created node. Both work on any installed host, so both moved to
// `installRecordingFabric()`. The rest of work-ledger.probe.test.tsx (the idle-surface-cost,
// second-cycle-cost, main ledger and growth-curve describes) stays on `installFabric()` — those
// read `measureWorkStep`, which is the mirror's OWN simulation of Fabric's `materialize` walk, the
// same derived-decision dependency Round 16 found in the other work-ledger files.
//
// THE ROW IS THE REAL ONE, same as its former home: a transcription of
// `examples/solid/screens/BenchmarkScreen.tsx`'s `BenchmarkRow` — ten native views, CSS classes
// rather than inline styles, two `onPress` listeners, the `<text-input>` last (F-33: an invented
// simpler row reads every no-op counter as zero, which clears nothing).

import { beforeEach, describe, expect, it } from 'vitest';
import { createSignal, For } from 'solid-js';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// By PACKAGE NAME, which this adapter already declares — a relative path across the package
// boundary typechecks but pulls `core/css-parser` into this project's build program, and
// `tsc --build` then emits its declarations into that package's SOURCE tree.
import { compileCssToRules } from '@symbiote-native/css-parser';

import {
  clearGlobalStyles,
  registerRules,
  setTreeHost,
  treeHost,
} from '@symbiote-native/engine';
import {
  registerPressableBehavior,
  registerTextInputBehavior,
} from '@symbiote-native/components';

import { mount, unmount } from './render';

registerPressableBehavior();
registerTextInputBehavior();

// COMPILED from the example app's own stylesheet rather than transcribed — see
// `work-ledger.probe.test.tsx`'s twin comment for why a hand copy has cost a measurement before.
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

const ROOT_TAG = 8850;
const ROW_POOL_SIZE = 20;

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

const ROW_POOL = makeRows(1, ROW_POOL_SIZE);

const noop = (): void => {};

// Was `work-ledger.ts`'s shared formatter; inlined here (its only real consumer left) once that
// file was deleted along with the mirror (`.docs/mirror-elimination.md`). Report-only — nothing in
// this file asserts against its output.
function formatPayloadCensus(
  adapter: string,
  created: readonly {
    viewName: string;
    props: Readonly<Record<string, unknown>>;
  }[],
): string {
  return `${[
    `${adapter} — ${created.length} nodes`,
    '',
    ...created.map((node, index) => {
      const keys = Object.keys(node.props).sort();
      return `${String(index).padStart(2)}  ${node.viewName.padEnd(28)}  ${keys.length} keys: ${keys.join(', ')}`;
    }),
    '',
  ].join('\n')}\n`;
}

type IDriver = { setRows: (rows: readonly IRow[]) => void };
let driver: IDriver | undefined;

function BenchmarkRow(props: { row: IRow }): ReturnType<typeof View> {
  return (
    <view class="bench-row">
      <text class="bench-row-id">{String(props.row.id)}</text>
      <pressable class="flex1" testID="flex1-pressable" onPress={noop}>
        <text class="bench-row-label">{props.row.label}</text>
      </pressable>
      <pressable class="bench-row-remove" onPress={noop}>
        <text class="bench-row-remove-text">×</text>
      </pressable>
      {/* LAST, exactly as the real row places it. No `multiline` — it selects a different native view. */}
      <text-input class="bench-row-input" value={props.row.label} />
    </view>
  );
}

function List(props: { count: number }): ReturnType<typeof View> {
  const [rows, setRows] = createSignal<readonly IRow[]>(
    ROW_POOL.slice(0, props.count),
  );
  driver = { setRows };
  return (
    <view testID="list">
      <For each={rows()}>{row => <BenchmarkRow row={row} />}</For>
    </view>
  );
}

beforeEach(() => {
  fabric.reset();
  driver = undefined;
  clearGlobalStyles();
  registerRules(benchmarkRowRules());
});

// WHO ASKS, and it is the question the crossing census (F-67) raises and cannot answer. That one
// names the host METHOD; a create still crosses many times on a real list, and `committedRecordOf`
// plus `propOf` say what was called, not from where.
//
// The site is read off the stack, which costs an Error construction per crossing and is why this is
// its own case on a SMALL list rather than a column on the ledger. Ten rows is enough: what is being
// looked for is a site that runs per node, and a per-node site shows up ten times.
describe('who crosses the boundary on a create', () => {
  it('names the call sites, not just the methods', async () => {
    const base = treeHost();
    if (base === undefined) throw new Error('no host installed');
    const sites: Record<string, number> = {};
    const counted: Record<string, unknown> = {};
    for (const name of Object.keys(base)) {
      const member: unknown = Reflect.get(base, name);
      if (typeof member !== 'function' || name === 'applyOps') continue;
      counted[name] = (...args: unknown[]): unknown => {
        // Frame 0 is `Error`, 1 is this wrapper, 2 is the engine function that crossed, 3 is its
        // caller. The pair is what identifies a site: `propOf` alone appears everywhere.
        const frames = (new Error().stack ?? '').split('\n').slice(2, 5);
        const where = frames
          .map(line => line.trim().replace(/^at /, '').split(' ')[0])
          .join(' <- ');
        const key = `${name}  ${where}`;
        sites[key] = (sites[key] ?? 0) + 1;
        return Reflect.apply(member, base, args);
      };
    }
    setTreeHost({ ...base, ...counted });

    mount(ROOT_TAG + 10, () => <List count={10} />);
    await flush();
    unmount(ROOT_TAG + 10);
    setTreeHost(base);

    writeFileSync(
      fileURLToPath(
        new URL('../../../.docs/crossing-sites-create.txt', import.meta.url),
      ),
      `${[
        '10 rows — a site that runs per node appears ten times',
        '',
        ...Object.entries(sites)
          .sort((left, right) => right[1] - left[1])
          .map(([key, count]) => `${String(count).padStart(5)}  ${key}`),
        '',
      ].join('\n')}\n`,
    );

    // A BUDGET PER BEHAVIOUR-CARRYING NODE, which on this row is the `<text-input>`. Everything
    // here crosses for one of two reasons — the behavior's setup reading its own props, or the
    // commit asking whether a node has a Fabric tag yet.
    const rows = 10;
    const perInput = Object.entries(sites)
      .filter(([key]) => !key.includes('teardown'))
      .reduce((total, [, count]) => total + count, 0);
    expect(perInput / rows).toBeLessThanOrEqual(2);
  });
});

describe('what one benchmark row actually commits', () => {
  it('names every payload key of every node', async () => {
    mount(ROOT_TAG + 20, () => <List count={1} />);
    await flush();

    const created = fabric
      .findAll(() => true)
      .map(node => ({
        viewName: node.viewName,
        props: payloadOf(node.handle),
      }));

    writeFileSync(
      fileURLToPath(
        new URL('../../../.docs/row-payload-census.txt', import.meta.url),
      ),
      formatPayloadCensus('solid', created),
    );
    unmount(ROOT_TAG + 20);

    // Ten native views of row, plus the list wrapper and the surface container. A census that lost
    // a node would still print a plausible table, so the count is pinned rather than eyeballed.
    expect(created).toHaveLength(12);
  });

  // WHAT THE BEHAVIORS SEED, pinned against the reference rather than against yesterday's output.
  //
  // RN's own JS emits `accessible`/`focusable` UNCONDITIONALLY and cross-platform
  // (`Pressable.js:252,258` — `accessible: accessible !== false`, `focusable: focusable !== false`)
  // — those two are RN's, not ours to trim.
  //
  // `underlineColorAndroid` is NOT one of these, and this line used to say it was (F-76,
  // `.docs/tree-inefficiency-findings.md`). `TextInput.js:908` does default it to `'transparent'`
  // unconditionally, but only at the REACT PROPS layer — `ReactNativeAttributePayload.create`
  // (`addNestedProperty`, same file) drops any key `validAttributes` doesn't declare, and iOS's
  // `RCTTextInputViewConfig.js` never declares `underlineColorAndroid` (only
  // `AndroidTextInputNativeComponent.js` does). So stock RN's own payload omits it on iOS; sending
  // it there was ours to trim, and now we do — in the engine, under `#ifdef ANDROID`
  // (`foldTextInputAliases`, `SymbioteFabricProps.cpp`).
  //
  // Stylesheet-independent on purpose: a CSS edit must not move this test, because what it pins is
  // the FOLD, not the row's look. `payloadOf`, not the authored bag — the fold is the claim.
  it('seeds the keys the reference seeds, and no others', async () => {
    mount(ROOT_TAG + 21, () => <List count={1} />);
    await flush();

    const seeded = (
      predicate: (entry: {
        viewName: string;
        props: Readonly<Record<string, unknown>>;
      }) => boolean,
      fromCss: readonly string[],
    ): string[] => {
      const node = fabric.find(predicate);
      if (node === undefined) throw new Error('no matching node was created');
      return Object.keys(payloadOf(node.handle))
        .filter(key => !fromCss.includes(key))
        .sort();
    };

    // Found by testID rather than "the first RCTView created": creation order is an
    // implementation detail of whichever host processes the op stream and is not guaranteed to
    // agree between hosts, so pinning it is the whole thing to avoid here. `testID` itself is
    // excluded below — it is this query's own marker, not something the CSS or the fold seeded.
    // The pressable seeds NOTHING here any more, and that is the port rather than a regression:
    // `accessible`/`focusable` are resolved by the engine (`foldPressableProps`) and this probe
    // reads the TypeScript builder's payload, which carries no copy of the rule. Asserted where it
    // runs — `core/engine/cpp/tests/js/pressable-payload.itest.ts`.
    expect(
      seeded(
        entry => entry.props.testID === 'flex1-pressable',
        ['flex', 'testID'],
      ),
    ).toEqual([]);
    expect(
      seeded(
        entry => entry.viewName === 'RCTSinglelineTextInputView',
        [
          'backgroundColor',
          'borderRadius',
          'color',
          'fontSize',
          'height',
          'paddingLeft',
          'paddingRight',
          'width',
        ],
      ),
      // `submitBehavior` left this census when TextInput's prop resolution moved into the engine
      // (`foldTextInputAliases`, `SymbioteFabricProps.cpp`) — this probe reads the TypeScript
      // builder's payload, which no longer carries a copy of that rule. The two left are the
      // MACHINE's, which is still JS: the acknowledged event count and the controlled text.
    ).toEqual(['mostRecentEventCount', 'text']);
    unmount(ROOT_TAG + 21);
  });
});

// @symbiote-platform-extensions
//
// Does the bench suite's row style reach the stock arm's shadow node at all?
//
// why: with the id prop dropped from every arm and `ROW_STYLE` carrying the device's background
// instead (see `bench-suite.ts`), the mutation counter reads `Create/View=1000` for the adapter arms
// and `Create/View=0` for stock on the same census. Two readings fit that: either we materialize a
// thousand host views a stock app does not, or the background never reaches stock's row and its rows
// are flattened for a reason that is a fixture bug. Three fixture bugs have already been found in
// this suite today, so the second reading is checked FIRST.
//
// `isColorMeaningful(backgroundColor)` is what sets `FormsView` (`ViewShadowNode::initialize`), so
// the question is answerable off the committed props of one row — no timing, no thousand rows.
//
// RUN ON `build-release` (`pnpm run bench:itest`). A development React cannot drive `ReactFabric-prod`.

import { createElement as h } from 'react';

import { CELL_STYLE, INPUT_STYLE, ROW_PAYLOAD, ROW_STYLE } from './bench-suite';
import {
  committedTree,
  describe,
  expect,
  findCommitted,
  flushTimers,
  it,
  payloadOf,
  print,
  report,
} from './harness';
import { loadStockRenderer } from './stock-renderer';

const ROOT_TAG = 1;

type IShadow = {
  viewName: string;
  props: Record<string, unknown>;
  children: readonly IShadow[];
};

/** The first node of the committed tree whose view name matches, depth first. */
function find(node: IShadow, viewName: string): IShadow | undefined {
  if (node.viewName === viewName) return node;
  for (const child of node.children) {
    const hit = find(child, viewName);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// `__DEV__` is the runner's own define and it tracks the build. A development React renders nothing
// here and REPORTS nothing — see `stock-suite.itest.tsx`.
declare const __DEV__: boolean;
const canHostStock = typeof __DEV__ === 'undefined' || __DEV__ === false;

/** Render one row carrying `style` through React's own renderer and return its committed props. */
function rowProps(style: Record<string, unknown>): string {
  // RN's OWN `<View>`, exactly as `stock-suite.itest.tsx` builds its row — not `h('RCTView')`. The
  // component is where RN's style processing lives, `processColor` among it, so a bare Fabric view
  // name answers a different question: the first version of this file used one, which would have
  // blamed the suite for its own shortcut.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const View = require('react-native/Libraries/Components/View/View').default;
  /* eslint-enable @typescript-eslint/no-require-imports */

  const renderer = loadStockRenderer();
  renderer.render(
    h(View, { style: { flex: 1 } }, h(View, { style })),
    ROOT_TAG,
    null,
    null,
  );
  flushTimers();

  const root = committedTree();
  if (root === undefined) throw new Error('nothing committed');
  // TWO levels down, not one. The root is a view and so is the wrapper under it, and a depth-first
  // search for `View` from either one returns that wrapper — which is how the first version of this
  // file read `{"flex":"1"}` and reported it as the row's props.
  const wrapper = root.children[0] as IShadow;
  const row = find(wrapper.children[0] as IShadow, 'View');
  if (row === undefined) throw new Error('no row view in the committed tree');
  return JSON.stringify(row.props);
}

/**
 * The bench suite's row, verbatim, as one payload dump.
 *
 * The components and the styles are `stock-suite.itest.tsx`'s own — a row built from bare Fabric
 * names would compare a tree nobody ships, which is the substitution that file already records
 * twice.
 */
function wholeRow(): string {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const View = require('react-native/Libraries/Components/View/View').default;
  const Text = require('react-native/Libraries/Text/Text').default;
  const TextInput =
    require('react-native/Libraries/Components/TextInput/TextInput').default;
  /* eslint-enable @typescript-eslint/no-require-imports */

  const label = (text: string): ReturnType<typeof h> =>
    h(Text, { ellipsizeMode: 'tail' }, text);

  const renderer = loadStockRenderer();
  renderer.render(
    h(
      View,
      { style: { flex: 1 } },
      h(
        View,
        { style: ROW_STYLE },
        label('1'),
        h(View, { style: CELL_STYLE }, label('row one')),
        h(View, { style: CELL_STYLE }, label('x')),
        h(TextInput, { style: INPUT_STYLE, value: 'row one' }),
      ),
    ),
    ROOT_TAG,
    null,
    null,
  );
  flushTimers();

  const row = findCommitted(node => node.props.backgroundColor !== undefined);
  if (row === undefined) throw new Error('no row view in the committed tree');
  return payloadOf(row);
}

const SKIP_NOTE =
  'DEBUG stock row traits SKIPPED — needs the bench build (bench:itest)';

describe('the bench row through React own renderer', () => {
  // why: THE POSITIVE CONTROL, and it has to come first. `describeShadow`'s own header says an absent
  // key proves nothing — the debug bag omits a prop at its default — so the case below can only mean
  // something once this one has shown `backgroundColor` present on a row that has one.
  it('commits a background given as a processed colour', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    // `processColor('#13243a')` by hand: RN's JS turns a colour string into this integer before it
    // ever reaches Fabric, and Fabric's props parser takes the integer and nothing else.
    const props = rowProps({ ...ROW_STYLE, backgroundColor: 0xff13243a });
    print(`DEBUG stock row, numeric colour :: ${props}`);
    expect(props).toContain('backgroundColor');
  });

  // why: the suite's own spelling, and the finding. A colour STRING is what `ROW_STYLE` carried and
  // what every app writes; it does not survive to the shadow node in this harness, so the stock arm's
  // row was never a host view while the five adapter arms' rows were. That is the whole of the
  // `Create/View=0` against `Create/View=1000` — a fixture difference, not an engine one, and the
  // fourth of its kind found in this suite today.
  it('drops a background given as a colour string', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    const props = rowProps({ ...ROW_STYLE, backgroundColor: '#13243a' });
    print(`DEBUG stock row, string colour  :: ${props}`);
    expect(props.includes('backgroundColor')).toBe(false);
  });

  // why: THE PAYLOAD HALF OF THE MUTATION ORACLE, and the half that was never taken. Every arm in
  // this suite emits a byte-identical mutation LIST, which is what made the engine look settled —
  // but a mounting log carries `type`, `nativeID` and `index` and no props at all, so payload
  // parity was assumed rather than asserted for as long as the comparison has existed. On a device
  // the payload is what the main thread spends its time on, field by differing field, so a
  // difference here is a difference nothing else in the harness can see.
  //
  // THIS side is what makes `ROW_PAYLOAD` a fact rather than a copy: it asserts the constant is
  // what React Native's own renderer commits. The other side — `row-payload-parity.itest.tsx`,
  // which cannot live in this bundle, since under this file's directive an engine import resolves
  // RN's `Platform.ios.js` and kills the build — asserts ours matches it.
  it('commits the row payload the constant records', () => {
    if (!canHostStock) {
      print(SKIP_NOTE);
      return;
    }
    const payload = wholeRow();
    print(`PAYLOAD stock :: ${payload}`);
    expect(payload).toBe(ROW_PAYLOAD);
  });
});

report();

// The OUR-SIDE half of the row payload dump. Its counterpart is `stock-row-traits.itest.tsx`.
//
// why the two halves are two files: the stock arm needs the platform-extensions directive, and
// under it an `@symbiote-native/engine` import resolves RN's `Platform.ios.js`, reaches for a native
// module and kills the bundle before anything runs. So the comparison is made across two processes,
// on two `PAYLOAD` lines, rather than inside one.
//
// AND THE DIRECTIVE IS NOT SPELLED ANYWHERE IN THIS FILE, including here. The runner greps the
// entry's whole text for it (`scripts/run-itests.mjs`), so NAMING it in a comment turns it on —
// which is how the first version of this file died in `processColor` with
// "__fbBatchedBridgeConfig is not set", an error that reads as a missing native module and is a
// sentence of prose.
//
// why at all: every arm of the bench suite emits a byte-identical mutation list, which is what made
// the engine look settled — but `StubViewTree::recordMutation` writes `type`, `nativeID` and
// `index` and no props, so the PAYLOAD was never compared. On a device that payload is what the main
// thread spends its time on: `updateProps:oldProps:` walks the fields that differ and creates layers
// for the ones that need them. A difference here is a device cost nothing else in this harness sees,
// and the device is where our overhead is +115 ms against stock's +30.
//
// RUN ON `bench:itest` — the stock half needs the bench build, since a development React cannot
// drive `ReactFabric-prod`.

import { createElement as h } from 'react';

import { mount } from '@symbiote-native/react';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_PAYLOAD,
  ROW_STYLE,
} from './bench-suite';
import {
  describe,
  expect,
  findCommitted,
  flushTimers,
  it,
  payloadOf,
  print,
  report,
} from './harness';

/** The bench suite's row, verbatim from `react-suite.itest.tsx`, as one payload dump. */
function wholeRow(): string {
  const label = (text: string): ReturnType<typeof h> =>
    h('text', { ellipsizeMode: 'tail' }, text);

  mount(
    ROOT_TAG,
    h(
      'view',
      { style: { flex: 1 } },
      h(
        'view',
        { style: ROW_STYLE },
        label('1'),
        h('view', { style: CELL_STYLE }, label('row one')),
        h('view', { style: CELL_STYLE }, label('x')),
        h('text-input', { style: INPUT_STYLE, text: 'row one' }),
      ),
    ),
  );
  flushTimers();

  // FOUND BY THE BACKGROUND, not by position: it is the one prop only the row carries, and a
  // depth-first search for a view name returns the wrapper above it instead — the mistake
  // `stock-row-traits.itest.tsx` records making.
  const row = findCommitted(node => node.props.backgroundColor !== undefined);
  if (row === undefined) throw new Error('no row view in the committed tree');
  return payloadOf(row);
}

describe('the bench row through the React adapter', () => {
  // why: the expectation is `ROW_PAYLOAD`, which `stock-row-traits.itest.tsx` separately proves is
  // what React Native's OWN renderer commits — so this asserts against RN's behaviour and not
  // against a string read back off our implementation.
  it('commits the same payload React Native own renderer does', () => {
    const payload = wholeRow();
    print(`PAYLOAD ours :: ${payload}`);
    expect(payload).toBe(ROW_PAYLOAD);
  });
});

report();

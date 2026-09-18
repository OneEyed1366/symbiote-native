// L1 (static paint) gate for the Solid adapter: real compiled Solid JSX, driven through the real
// renderer seam, committing into the fake Fabric slot. This is the test that proves the
// compiled-JSX contract actually lines up — babel-preset-solid rewrites the JSX below into imports
// from ./renderer, so if that module's named exports drifted from what the compiler emits, this file
// fails to even load. tsc cannot catch that: it type-checks the JSX and emits it untouched
// (`jsx: 'preserve'`), leaving the whole compile step to Babel.
//
// The Vitest `solid` project (vitest.config.ts) runs that same Babel transform with the same
// `moduleName`/`generate` the app-facing ../babel-preset.cjs pins.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const ROOT_TAG = 707;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// The surface commits on a microtask (requestCommit), so every assertion waits one macrotask —
// the same shape as the Vue adapter's renderer tests.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Reads the LIVE tree, not the recording (which keeps every node ever created, including ones a
// later clone-on-write superseded — symbiote-engine-core §8).
function findCommitted(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
}

describe('solid adapter — static paint', () => {
  it('commits a host element tree with props and nested text', async () => {
    function App() {
      return (
        <view testID="root" style={{ flex: 1 }}>
          <text>hello</text>
        </view>
      );
    }

    mount(ROOT_TAG, App);
    await tick();

    const view = findCommitted(node => node.payload.testID === 'root');
    expect(view, 'the root View committed').toBeDefined();
    expect(view?.viewName).toBe('RCTView');
    expect(view?.payload.flex).toBe(1);

    expect(
      findCommitted(node => node.viewName === 'RCTText'),
      'the Text committed',
    ).toBeDefined();
    expect(
      findCommitted(
        node => node.viewName === 'RCTRawText' && node.payload.text === 'hello',
      ),
      'the text content committed as an RCTRawText',
    ).toBeDefined();
  });

  it('rejects a dynamic string rendered outside a <Text>', () => {
    // Fabric has no bare-text host. A `{...}` expression resolving to a string under a plain View is
    // the one loud failure in the seam — it must throw at mount rather than build an invalid tree.
    function Stray() {
      const label = (): string => 'stray';
      return <view>{label()}</view>;
    }

    expect(() => mount(ROOT_TAG, Stray)).toThrow(
      'must be rendered inside a <Text>',
    );
  });
});

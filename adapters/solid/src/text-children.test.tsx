// What a <Text>'s children become on the way to Fabric
// Two claims guard a real iOS abort: `{list().length} tiles` died in `buildAttributedString`

// A raw text's `text` is parsed natively as a `std::string`, and any other type falls back to ''
// `appendFragment` then drops the empty fragment, so the next sibling merges into an empty vector
// Solid can hand over a non-string, as `normalizeIncomingArray()` skips the DOM's coercion

// No Negative group: a raw string outside a <Text> does throw, owned by `view.test.tsx`

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const ROOT_TAG = 9_477;
const RAW_TEXT = 'RCTRawText';

const fabric = installRecordingFabric();
// Asks for the nodes, as the claim is that the adapter empties a raw text in place
const live = createLiveTree(fabric, { keepBlankText: true });
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Every raw text's `text`, unfiltered and uncoerced, as `live.texts()` stringifies and hides it
// The live tree rather than the recording, as a created node's props freeze at its first commit
function committedText(): unknown[] {
  return live
    .findAllLive(live.appRoot(), node => node.viewName === RAW_TEXT)
    .map(node => node.payload.text);
}

describe('text children reaching Fabric', () => {
  // A count interpolated into a sentence is what aborted the canary, so it must arrive as a string
  it('commits a numeric expression as a string', async () => {
    const [tiles] = createSignal([1, 2, 3]);
    mount(ROOT_TAG, () => <text>{tiles().length} tiles</text>);
    await tick();

    expect(committedText()).toEqual(['3', ' tiles']);
  });

  // An expression emptying out is a normal update, and its node must not commit as empty text
  it('empties the raw text in place rather than replacing the node', async () => {
    const [name, setName] = createSignal('Ada');
    mount(ROOT_TAG, () => <text>{name()} — hello</text>);
    await tick();
    expect(committedText()).toEqual(['Ada', ' — hello']);

    setName('');
    await tick();

    // The node stays, carrying an empty string, as the adapter updates text in place
    // The commit drops it, asserted in `solid-adapter.itest.tsx` and `text-nesting.itest.ts`
    expect(committedText()).toEqual(['', ' — hello']);
  });

  // The rule is empty, never blank: a space between two nested texts keeps "a b" two words
  it('keeps a whitespace-only literal between two nested texts', async () => {
    mount(ROOT_TAG, () => (
      <text>
        <text>a</text> <text>b</text>
      </text>
    ));
    await tick();

    expect(committedText()).toEqual(['a', ' ', 'b']);
  });
});

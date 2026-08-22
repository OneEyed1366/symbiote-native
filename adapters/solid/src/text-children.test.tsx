// What a <Text>'s children actually become on the way to Fabric. Two of the three claims here were
// written from a real iOS abort (2026-08-19): the app died inside
// BaseTextShadowNode::buildAttributedString the moment a screen with `{list().length} tiles` was
// mounted.
//
// The trap is that RCTRawText's `text` is parsed natively as a std::string. Anything else fails the
// conversion, and Fabric does not throw — convertRawProp logs and falls back to the DEFAULT, i.e.
// the empty string. An empty fragment is then dropped by AttributedString::appendFragment while the
// walk still records "last child was raw text", so the next sibling merges into `fragments.back()`
// of an empty vector and the process aborts. Nothing about that is visible from JS.
//
// Solid is the adapter that can hand over a non-string: solid-js/universal's
// normalizeIncomingArray() pushes `createTextNode(item)` with the JSX child value UNCONVERTED, and
// on the DOM that is harmless because document.createTextNode coerces. Vue and React stringify
// upstream, so neither ever noticed.
//
// No Negative group: the renderer has no throwing path for a text child. A raw string outside a
// <Text> DOES throw, and that contract is owned by view.test.tsx.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { Text } from './components/text';

const ROOT_TAG = 9_477;
const RAW_TEXT = 'RCTRawText';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Every committed raw text's `text` prop, UNFILTERED — the point of this file is what the value
// actually is, so a walker that kept only strings (jsx-runtime.test.tsx's) would hide the bug.
// Reads `fabric.committed`, since a created node's props are frozen at its first commit
// (symbiote-engine-core §8).
function committedText(): unknown[] {
  const found: unknown[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === RAW_TEXT) found.push(node.props.text);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return found;
}

describe('text children reaching Fabric', () => {
  // why: a count interpolated into a sentence is the most ordinary line of app code there is, and
  // it is exactly what aborted the canary. The value must arrive as a string, not as a number.
  it('commits a numeric expression as a string', async () => {
    const [tiles] = createSignal([1, 2, 3]);
    mount(ROOT_TAG, () => <Text>{tiles().length} tiles</Text>);
    await tick();

    expect(committedText()).toEqual(['3', ' tiles']);
  });

  // why: an expression emptying out is a normal reactive update. The node it leaves behind must not
  // be committed as an empty raw text — that is the same abort, reached with pure strings.
  it('commits nothing for an expression that empties out', async () => {
    const [name, setName] = createSignal('Ada');
    mount(ROOT_TAG, () => <Text>{name()} — hello</Text>);
    await tick();
    expect(committedText()).toEqual(['Ada', ' — hello']);

    setName('');
    await tick();
    expect(committedText()).toEqual([' — hello']);
  });

  // why: the rule is "empty", never "blank". A space between two nested texts is what makes
  // "a b" read as two words, so it has to survive everything above.
  it('keeps a whitespace-only literal between two nested texts', async () => {
    mount(ROOT_TAG, () => (
      <Text>
        <Text>a</Text> <Text>b</Text>
      </Text>
    ));
    await tick();

    expect(committedText()).toEqual(['a', ' ', 'b']);
  });
});

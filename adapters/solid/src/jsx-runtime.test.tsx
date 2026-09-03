// solid-js's own control flow, driven through THIS package's renderer and JSX namespace.
//
// Why a file for something that looks like framework-testing: two claims here are ours, not
// Solid's, and both are silently breakable.
//
// 1. COMPOSITION. src/jsx-runtime.ts declares a JSX namespace of our own rather than augmenting
//    solid-js's, and its `Element` is a different type from solid's. `<Show>` and `<For>` are typed
//    against SOLID's `Element` and cannot know about ours, so they compose only because solid's
//    degrades to `any` in a DOM-less program (that file's point 2). If a future config ever gives
//    solid's `Element` a real `Node` — an app that pulls in the DOM lib — the two stop lining up.
//    That break is type-level and this file cannot see it; what it does pin is the other half, that
//    the elements these components return actually reach Fabric through our renderer at runtime.
// 2. THE IMPORT ITSELF. babel-preset-solid with `generate: 'universal'` resolves an UNIMPORTED
//    control-flow name against the renderer module — `<Show>` with no import compiles to
//    `_renderer.Show`, a property renderer.ts does not export, and fails at runtime with the JSX
//    long gone from the stack (.claude/rules/solid-descriptor-bridge.md §3). These tests import
//    explicitly, so they are also the executable statement of that requirement.
//
// `<For>` had no coverage anywhere in this package before this file; `<Show>` was incidentally
// exercised by view.test.tsx and safe-area-view.test.tsx, and is repeated here for the update path
// (a keyed rebuild vs a leaf update is exactly what the Pressable render-prop bug turned on).

import { createSignal, For, Show } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { Text } from './components/text';
import { View } from './components/view';

const ROOT_TAG = 9_311;
const RAW_TEXT = 'RCTRawText';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Every raw-text string in the LIVE committed tree, in order. Reads `fabric.committed` rather than
// `fabric.created`: a created node's props are frozen at its first commit, so an update asserted
// off it would pass forever (symbiote-engine-core §8).
function committedText(): string[] {
  const found: string[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === RAW_TEXT) {
        const text = node.props.text;
        if (typeof text === 'string') found.push(text);
      }
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return found;
}

describe("solid-js control flow through this package's renderer", () => {
  it('mounts and updates a <Show> branch', async () => {
    const [ready, setReady] = createSignal(false);
    mount(ROOT_TAG, () => (
      <View>
        <Show when={ready()} fallback={<Text>waiting</Text>}>
          <Text>ready</Text>
        </Show>
      </View>
    ));
    await tick();
    expect(committedText()).toEqual(['waiting']);

    setReady(true);
    await tick();
    expect(committedText()).toEqual(['ready']);
  });

  // why: a child that only appears LATER is the case Solid's run-once body makes breakable — the
  // fallback branch mounts first, so the renderer has to insert into a subtree it already committed.
  it('renders a <For> list and reflects a later append', async () => {
    const [items, setItems] = createSignal(['one', 'two']);
    mount(ROOT_TAG, () => (
      <View>
        <For each={items()}>{item => <Text>{item}</Text>}</For>
      </View>
    ));
    await tick();
    expect(committedText()).toEqual(['one', 'two']);

    setItems(current => [...current, 'three']);
    await tick();
    expect(committedText()).toEqual(['one', 'two', 'three']);
  });

  // why: <For> is keyed by item identity, so a reorder must MOVE the existing nodes rather than
  // recreate them. If our insertNode/removeNode pair mishandled the anchor, the order would come
  // back wrong while every other assertion in this file still passed.
  it('reorders a <For> list without losing entries', async () => {
    const [items, setItems] = createSignal(['a', 'b', 'c']);
    mount(ROOT_TAG, () => (
      <View>
        <For each={items()}>{item => <Text>{item}</Text>}</For>
      </View>
    ));
    await tick();
    expect(committedText()).toEqual(['a', 'b', 'c']);

    setItems(['c', 'a', 'b']);
    await tick();
    expect(committedText()).toEqual(['c', 'a', 'b']);
  });
});

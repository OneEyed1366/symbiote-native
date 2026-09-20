// EXACTLY ONE thing may build a ScrollView's content node, and that thing is the engine:
// `registerScrollViewBehavior()` puts a `buildStructure` on the scroll tags. Anything in this
// adapter that ALSO emits `scroll-content` gives the tree a second `RCTScrollContentView` nested
// inside the first — no error, no warning, and on a device only a layout that is subtly wrong.
// This file is the guard for that, across every React path that reaches a scroll node.
//
// WHY IT IS A SEPARATE FILE from `scroll-view.test.tsx`. That one asserts what a mount paints;
// this asserts a property of the OWNERSHIP, and it has to hold for the bare tag and for the list
// family at once — `VirtualizedList` stays a component and reaches the same node.
//
// THE CONTROL ARM is what makes the count mean anything: `expect(contentNodes).toBe(1)` passes on
// a tree with no ScrollView in it at all, and would go on passing if the mount silently produced
// nothing. Every case therefore also asserts the app's own child is a DESCENDANT of the one
// content node — a capability an app depends on, rather than a shape
// (`.claude/rules/adapter-parity-audit.md`, "Phrase a parity oracle as a CAPABILITY").

// A RECORDING host, and the tree walked here is the AUTHORED one. The question is WHO EMITTED the
// content node; `RCTScrollContentView` is a name the engine sends, and React Native's own
// `componentNameByReactViewName` maps `ScrollContentView` to plain `View`, so the committed tree
// cannot tell a content node from any other view by name at all.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import { childrenOf } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  payloadOf,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 6102;
const SCROLL_VIEW = 'RCTScrollView';
const SCROLL_CONTENT = 'RCTScrollContentView';
const CHILD_ID = 'owner-child';

const fabric = installRecordingFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function countByName(name: string): number {
  return fabric.findAll(node => node.viewName === name).length;
}

function findByTestId(id: string): IAuthoredNode | undefined {
  return fabric.find(node => node.props.testID === id);
}

// Is the app's own child underneath the ONE content node, rather than a sibling of it? That is the
// observable an app depends on; "the content node exists" is not.
//
// Descends from the content node rather than from a root, which is the same claim stated forwards:
// the engine's structure builder put the app's children INSIDE what it created.
function childIsUnderContent(): boolean {
  const content = fabric.find(node => node.viewName === SCROLL_CONTENT);
  if (content === undefined) return false;
  const descend = (handle: object): boolean => {
    for (const child of childrenOf(handle)) {
      const recorded = fabric.find(node => node.handle === child);
      if (recorded?.props.testID === CHILD_ID) return true;
      if (descend(child)) return true;
    }
    return false;
  };
  return descend(content.handle);
}

describe('exactly one owner builds the scroll content node', () => {
  // why: the bare tag is what an app writes now. A ScrollView with NO behavior registered commits
  // its children straight into RCTScrollView — no content node at all, `contentContainerStyle`
  // with nowhere to land — which is the state this adapter was in before `register.ts` named it.
  it.each([
    ['scroll-view', <scroll-view key="v" testID="sv" />],
    ['horizontal-scroll-view', <horizontal-scroll-view key="h" testID="sv" />],
  ])('a bare <%s> owns exactly one content node', (_name, element) => {
    mount(ROOT_TAG, element);
    expect(countByName(SCROLL_VIEW), 'one scroll view').toBe(1);
    expect(countByName(SCROLL_CONTENT), 'one content node').toBe(1);
  });

  it('nests the app children under that one content node', () => {
    mount(
      ROOT_TAG,
      <scroll-view testID="sv">
        <view testID={CHILD_ID} />
      </scroll-view>,
    );
    expect(countByName(SCROLL_CONTENT)).toBe(1);
    expect(childIsUnderContent(), 'the child is inside the content node').toBe(
      true,
    );
  });

  // why: `contentContainerStyle` is the whole reason the slot has to be the ENGINE's. It is
  // authored on the owner and belongs to the content node, and the behavior's `slotProps` is what
  // moves it — a second owner would land it on the wrong one of the two.
  it('routes contentContainerStyle onto the content node, not the scroll view', () => {
    mount(
      ROOT_TAG,
      <scroll-view testID="sv" contentContainerStyle={{ padding: 7 }}>
        <view testID={CHILD_ID} />
      </scroll-view>,
    );
    const content = fabric.find(node => node.viewName === SCROLL_CONTENT);
    expect(content, 'a content node was created').toBeDefined();
    // The PAYLOAD: `padding` is a style key, flattened on the way into it.
    expect(payloadOf(content!.handle).padding).toBe(7);
    const owner = findByTestId('sv');
    expect(owner, 'the scroll view itself was created').toBeDefined();
    expect(payloadOf(owner!.handle).padding).toBeUndefined();
  });

  // why: the list family is the OTHER path to a scroll node, and it stays a component. It must
  // render the scroll TAG and know nothing about what is inside — the moment it builds a content
  // node of its own, this reads 2 and every layout under it is wrong on a device only.
  it('VirtualizedList reaches the same single content node', () => {
    mount(
      ROOT_TAG,
      <VirtualizedList
        testID="sv"
        data={[1]}
        getItem={(d: number[], i: number) => d[i]}
        getItemCount={(d: number[]) => d.length}
        keyExtractor={(item: number) => String(item)}
        renderItem={({ item }: { item: number }) => (
          <text testID={CHILD_ID}>{String(item)}</text>
        )}
      />,
    );
    expect(countByName(SCROLL_VIEW), 'one scroll view').toBe(1);
    expect(countByName(SCROLL_CONTENT), 'one content node').toBe(1);
    expect(childIsUnderContent(), 'the cell is inside the content node').toBe(
      true,
    );
  });
});

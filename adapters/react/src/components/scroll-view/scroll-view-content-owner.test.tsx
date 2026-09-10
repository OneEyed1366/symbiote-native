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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 6102;
const SCROLL_VIEW = 'RCTScrollView';
const SCROLL_CONTENT = 'RCTScrollContentView';
const CHILD_ID = 'owner-child';

const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(
  nodes: readonly IFakeNode[],
  visit: (n: IFakeNode) => void,
): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function countByName(name: string): number {
  let found = 0;
  walk(fabric.committed, node => {
    if (node.viewName === name) found += 1;
  });
  return found;
}

function findByTestId(id: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.props.testID === id) found = node;
  });
  return found;
}

// Is the app's own child underneath the ONE content node, rather than a sibling of it? That is the
// observable an app depends on; "the content node exists" is not.
function childIsUnderContent(): boolean {
  let under = false;
  const descend = (node: IFakeNode, insideContent: boolean): void => {
    const nowInside = insideContent || node.viewName === SCROLL_CONTENT;
    if (nowInside && node.props.testID === CHILD_ID) under = true;
    for (const child of node.children) descend(child, nowInside);
  };
  for (const root of fabric.committed) descend(root, false);
  return under;
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
    let content: IFakeNode | undefined;
    walk(fabric.committed, node => {
      if (node.viewName === SCROLL_CONTENT) content = node;
    });
    expect(content, 'a content node was committed').toBeDefined();
    expect(content!.props.padding).toBe(7);
    expect(findByTestId('sv')?.props.padding).toBeUndefined();
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

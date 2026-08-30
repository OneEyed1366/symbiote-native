// Does the FIRST press after mount reach the screen, or only the second?
//
// Asked by the Vue session, which sees the first press fire its callback while the visual does not
// change. The suspected mechanism is shared by every adapter that lowers Pressable: the host
// behavior now calls `setNodePressed` + `requestCommitFor(node)`, which schedules a TARGETED commit
// on a microtask. If that targeted commit lands before the framework's own commit for the same tick
// and clears dirty flags along its path without descending, the framework's update is orphaned.
//
// Solid schedules its own commit as a microtask too (renderer.ts `requestCommit`), so the two land
// in the same queue and the ordering is exactly what is under test. A press here changes a prop on
// a SIBLING subtree — deliberately not on the pressed node — because the targeted commit walks only
// the pressed node's own chain, and a sibling is what it would orphan.
import { afterEach, describe, expect, it } from 'vitest';
import { createSignal } from 'solid-js';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

const fabric = installFabric();
const ROOT_TAG = 828;
const BUTTON = 'first-press-button';
const OUTPUT = 'first-press-output';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => unmount(ROOT_TAG));

function committed(testID: string): IFakeNode {
  const walk = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const hit = walk(root);
    if (hit !== undefined) return hit;
  }
  throw new Error(`no committed node with testID=${testID}`);
}

// Responder listeners hang off the CREATED node's instanceHandle; clone-on-write hands back a new
// committed object on every update, so the committed node's handle is not the one they are on.
function press(): void {
  const created = fabric.find(n => n.props.testID === BUTTON);
  if (created === undefined) throw new Error('button was never created');
  const point = { pageX: 4, pageY: 4, identifier: 1, timestamp: 0 };
  for (const type of [TOUCH_START, TOUCH_END]) {
    fabric.fireEvent(created.instanceHandle, type, {
      pageX: 4,
      pageY: 4,
      touches: type === TOUCH_END ? [] : [point],
      changedTouches: [point],
    });
  }
}

describe('a lowered Pressable on its first press', () => {
  it('publishes the framework update on press ONE, not only on press two', async () => {
    let calls = 0;
    const [tint, setTint] = createSignal('#000');
    mount(ROOT_TAG, () => (
      <symbiote-view>
        <symbiote-pressable
          testID={BUTTON}
          onPress={() => {
            calls += 1;
            setTint(calls === 1 ? '#111' : '#222');
          }}
        />
        <symbiote-view testID={OUTPUT} style={{ backgroundColor: tint() }} />
      </symbiote-view>
    ));
    await flush();
    expect(committed(OUTPUT).props.backgroundColor, 'before any press').toBe(
      '#000',
    );

    // ONE commit for the whole press, and that is the answer to the orphaning question rather than
    // a detail. The behavior calls `requestCommitFor` unconditionally and Solid's renderer requests
    // its own commit for the state change, so two are asked for — and exactly one lands. They
    // coalesce, so there is no second commit for a targeted one to strip dirty flags from. An
    // adapter that produced TWO here is the one where the ordering hazard is real; measuring this
    // count is how to tell the two apart.
    const commitsBefore = fabric.counts.completeRoot;
    press();
    await flush();
    expect(
      fabric.counts.completeRoot - commitsBefore,
      'the press and the state change coalesce into one commit',
    ).toBe(1);
    expect(calls, 'the callback itself fires — never in doubt').toBe(1);
    expect(
      committed(OUTPUT).props.backgroundColor,
      'FIRST press must reach the committed tree',
    ).toBe('#111');

    press();
    await flush();
    expect(
      committed(OUTPUT).props.backgroundColor,
      'and so must the second',
    ).toBe('#222');
  });
});

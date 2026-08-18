// A windowed list renumbers sticky positions constantly: `stickyHeaderIndices` from a
// VirtualizedList are positions in the RENDERED child array (`stickyChildPositions`), so growing a
// leading spacer or a forced sticky cell shifts every one of them by 1-3 while the headers
// themselves are untouched. The controller used to answer that by destroying the wrapper and
// building a new one, which threw away the header's measured layout and cost a native round trip
// (restoreDefaultValues + dropAnimatedNode out, a fresh interpolation + AnimatedProps in) on every
// window step. This pins the fix: a pure position shift REUSES the wrapper.
//
// Fabric clones keep their tag (fake-fabric.ts), so the tag is the identity that survives a commit
// and a recreated wrapper is a new tag — which makes this assertion structural rather than a probe
// of the current implementation.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { ScrollView } from '../../components';

const ROOT_TAG = 9932;
const MEASURED_Y = 140;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let host: StickyReuseApp | undefined;

class StickyReuseApp {
  // Both signals, and both written in the SAME turn below: that is the shape a window step has —
  // the leading child and the indices move together, and the reconcile must see them together.
  readonly hasLead = signal(false);
  readonly stickyIndices = signal([1, 3]);

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}
Component({
  selector: 'symbiote-sticky-reuse-test',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [stickyHeaderIndices]="stickyIndices()">
      @if (hasLead()) {
        <symbiote-view testID="lead"></symbiote-view>
      }
      <symbiote-view testID="row0"></symbiote-view>
      <symbiote-view testID="h1"></symbiote-view>
      <symbiote-view testID="row2"></symbiote-view>
      <symbiote-view testID="h3"></symbiote-view>
    </ScrollView>
  `,
})(StickyReuseApp);

beforeEach(() => {
  fabric.reset();
  host = undefined;
});
afterEach(() => unmount(ROOT_TAG));

// Walks the COMMITTED tree, deliberately not `fabric.find`: that one searches `created` — every
// node ever createNode'd this run — so a node the engine has since detached is still returned, with
// the stale children it had at creation. An assertion that a wrapper is GONE can therefore never
// pass through it, and an assertion that one is the SAME can pass on a leftover. Only the tree under
// appRoot() answers either question.
//
// The viewName check is load-bearing: RCTScrollContentView carries the same two props and holds
// every child, so without it this matches the content view for ANY testID.
function stickyWrapperAround(testID: string): IFakeNode | undefined {
  const pending = [fabric.appRoot()];
  while (pending.length > 0) {
    const node = pending.shift();
    if (node === undefined) continue;
    if (
      node.viewName === 'RCTView' &&
      node.props.collapsable === false &&
      node.props.onLayout === true &&
      node.children.some(child => child.props.testID === testID)
    ) {
      return node;
    }
    pending.push(...node.children);
  }
  return undefined;
}

// why: the reuse is only observable through the STATE the wrapper carries. The wrapper NODE is
// created by wrapRecord and survives either way, so its tag proves nothing; what a recreated wrapper
// loses is `createInitialStickyState()` — the measured layout. The reducer prints it (`STICKY[reducer
// y=<layoutY>]`), so a header that measured at 140 and then shifted position still says 140 when it
// was reused and says 0 when it was rebuilt.
async function stickyLinesWhile(act: () => void): Promise<string[]> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  globalThis.__SYMBIOTE_DEBUG__ = true;
  try {
    act();
    await tick();
  } finally {
    globalThis.__SYMBIOTE_DEBUG__ = false;
    spy.mockRestore();
  }
  return lines;
}

describe('a sticky header shifted by a new leading sibling keeps its wrapper', () => {
  // why: without this the wrapper is rebuilt on every window step — and a header that has to
  // re-measure cannot pin correctly on the frame it was renumbered, which is every frame a windowed
  // list moves its window.
  it('keeps the measured layout when only the paint index moved', async () => {
    mount(ROOT_TAG, StickyReuseApp);
    await tick();

    const wrapper = stickyWrapperAround('h1');
    expect(wrapper, 'h1 is sticky at index 1 before the shift').toBeDefined();
    fabric.fireEvent(wrapper?.instanceHandle, 'topLayout', {
      layout: { x: 0, y: MEASURED_Y, width: 320, height: 30 },
    });
    await tick();

    // One leading child appears and every sticky position moves by one — the window step.
    const lines = await stickyLinesWhile(() => {
      host?.hasLead.set(true);
      host?.stickyIndices.set([2, 4]);
    });

    expect(stickyWrapperAround('h1'), 'h1 is still sticky after the shift').toBeDefined();
    expect(lines.some(line => line.includes(`STICKY[reducer y=${MEASURED_Y}]`))).toBe(true);
  });

  // why: reuse must not become "never rebuild" — a child that stops being sticky still has to lose
  // its wrapper, which is the other half of the same branch.
  it('still drops the wrapper when the child stops being sticky', async () => {
    mount(ROOT_TAG, StickyReuseApp);
    await tick();
    expect(stickyWrapperAround('h1')).toBeDefined();

    host?.stickyIndices.set([3]);
    await tick();

    expect(stickyWrapperAround('h1')).toBeUndefined();
    expect(stickyWrapperAround('h3')).toBeDefined();
  });
});

// A sticky header's pinned translateY is computed by the NATIVE animated driver, so the committed
// props read `transform: [{ translateY: 0 }]` whether or not the collision math is right — there is
// no prop to assert on. What IS observable, and what this file pins, is the FAN-OUT: how many
// wrappers a single header's layout notifies.
//
// It matters because the notification is O(1) by construction. `nextStickyHeaderY(i)` returns the
// first sticky index greater than i, so a header's recorded Y is read by exactly one other header —
// the closest sticky index below it. `recordHeaderLayoutY` used to rebuild EVERY record instead;
// with 200 sticky headers that is 199 wasted dispatches per layout event and ~40 000 to settle one
// screen, which is what starved the JS thread on examples/angular's benchmark screen while the
// canary (3 sticky headers, same code) looked perfectly healthy.
//
// The reducer's own "ranges unchanged, skipped rebuild" guard hides the waste from any assertion on
// rebuilds — a broadcast to uninterested headers produces no rebuild. So the dispatch itself is the
// measurement, read off the permanent STICKY seams.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { ScrollView } from '../../components';

const ROOT_TAG = 9931;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

class StickyFanoutApp {}
Component({
  selector: 'symbiote-sticky-fanout-test',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // Three sticky headers, so "notified only the previous one" is distinguishable from "notified
  // everyone" — with two it would not be.
  template: `
    <ScrollView [stickyHeaderIndices]="[0, 2, 4]">
      <symbiote-view testID="h0"></symbiote-view>
      <symbiote-view testID="row1"></symbiote-view>
      <symbiote-view testID="h2"></symbiote-view>
      <symbiote-view testID="row3"></symbiote-view>
      <symbiote-view testID="h4"></symbiote-view>
      <symbiote-view testID="row5"></symbiote-view>
    </ScrollView>
  `,
})(StickyFanoutApp);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The viewName check is load-bearing: RCTScrollContentView carries the same two props and holds
// every child, so without it this matches the content view for ANY testID.
function stickyWrapperAround(testID: string): IFakeNode | undefined {
  return fabric.find(
    node =>
      node.viewName === 'RCTView' &&
      node.props.collapsable === false &&
      node.props.onLayout === true &&
      node.children.some(child => child.props.testID === testID),
  );
}

// why: the dispatch count is only emitted through dlog, which is off unless DEBUG is on.
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

// No Negative group: there is no invalid input here, only a fan-out to count.
describe('a sticky header layout notifies one neighbour, not every header', () => {
  // why: this is the whole difference between a screen that scrolls and one that starves — the
  // per-event cost is O(1) or O(N), and N is the section count the app chooses.
  it('dispatches to the header before it and to no other', async () => {
    mount(ROOT_TAG, StickyFanoutApp);
    await tick();

    const last = stickyWrapperAround('h4');
    expect(last).toBeDefined();

    const lines = await stickyLinesWhile(() => {
      fabric.fireEvent(last?.instanceHandle, 'topLayout', {
        layout: { x: 0, y: 500, width: 320, height: 30 },
      });
    });

    // One `recordHeaderLayoutY` fan-out. The header's OWN layout action is a `layout` dispatch, not
    // an `inputs-changed` one, so it does not land in this count.
    const fanout = lines.filter(line => line.includes('action=inputs-changed'));
    expect(fanout).toHaveLength(1);
    // And it is the neighbour below — the only header whose nextStickyHeaderY is 4.
    expect(lines.some(line => line.includes('nextStickyHeaderY(index=2)'))).toBe(true);
    expect(lines.some(line => line.includes('nextStickyHeaderY(index=0)'))).toBe(false);
  });
});

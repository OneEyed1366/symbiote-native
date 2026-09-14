// The TAG twin of `responder-change-detection.test.ts`, which guards the same property on the
// COMPONENT path. A flat-bag `onX` prop is a plain function the ENGINE calls on event dispatch —
// Angular is never told. An `(event)` binding is wrapped by Angular's own
// `wrapListenerIn_markDirtyAndPreventDefault` and therefore notifies; a prop does not, so a plain
// state mutation inside one dirties nothing and the template stays stale forever.
//
// Device-reported 2026-09-11 on `examples/angular`: `<pressable [onPressMove]="onRetentionMove">`
// read "drag me · dx 0 · dy 0" through the whole gesture, and the real numbers appeared only when
// an unrelated button was pressed — that button's `(press)` binding ran the tick the drag never
// asked for. `SymbioteHostPropsDirective.wrapCallback` (primitives/shared.ts) has covered this on
// the component path since 2026-08; `SymbioteElement` never inherited it.
//
// THE ORACLE IS THE RENDERED TEXT, not the component field: the field moves in both arms. What is
// broken is that nothing re-evaluates the binding reading it.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import '../register';
import { mount, unmount } from '../render';
import { SYMBIOTE_ELEMENTS } from '../elements';

const ROOT_TAG = 9482;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'tag-prop-cd-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  // Plain fields, not signals — the shape the canary writes, and the one that depends entirely on
  // something marking the view dirty.
  template: `
    <view testID="probe" [onLayout]="onLayout"></view>
    <text testID="readout">{{ layouts }}</text>
  `,
})
class TagPropCdHost {
  layouts = 0;
  onLayout = (): void => {
    this.layouts += 1;
  };
}

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (predicate(node)) return node;
    stack.push(...node.children);
  }
  return undefined;
}

function readout(): string | undefined {
  const raw = findCommitted(n => n.props.testID === 'readout')?.children[0];
  return typeof raw?.props.text === 'string' ? raw.props.text : undefined;
}

// The stable event target: identity survives clone-on-write.
function handle(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

const layout = { layout: { x: 0, y: 0, width: 10, height: 10 } };

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('a flat-bag onX prop repaints the view that binds its result', () => {
  // Driven THREE times, like the component-path twin: a fix that arms its refresh once would pass
  // a single-fire assertion and stop repainting on the second gesture phase.
  it('re-renders after every invocation, not just the first', async () => {
    mount(ROOT_TAG, TagPropCdHost);
    await tick();
    expect(readout()).toBe('0');

    for (const expected of ['1', '2', '3']) {
      fabric.fireEvent(handle('probe'), 'topLayout', layout);
      await tick();
      await tick();
      expect(readout()).toBe(expected);
    }
  });
});

// Does a TouchableOpacity's style stay LIVE after mount, or is it frozen at creation?
//
// This exists because the Angular adapter's TouchableOpacity is frozen: a `[style]` change or a
// class toggled after mount never reaches the committed view, while the press-opacity animation
// keeps working (it rides the Animated leaf, not the prop bag), so the component looks healthy.
// React is the reference adapter, so this file answers "is that shape-specific to Angular, or did
// every adapter inherit it from the shared Touchable design?" - a question worth a test rather
// than an assumption, since all four wrap the same core state machine.
//
// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`. The
// clone here MERGES the patch, mirroring real Fabric, so a partial diff does not wipe the rest.

import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, TouchableOpacity, Text } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mergeProps(
  previous: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...previous, ...patch };
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) delete merged[key];
  }
  return merged;
}

const fabric = installFabric();
const installed: unknown = globalThis.nativeFabricUIManager;
if (!isRecord(installed)) throw new Error('fabric slot was not installed');
installed.cloneNodeWithNewProps = (node: IFakeNode, patch: Record<string, unknown>): IFakeNode => ({
  ...node,
  props: mergeProps(node.props, patch),
});
installed.cloneNodeWithNewChildrenAndProps = (
  node: IFakeNode,
  patch: Record<string, unknown>,
): IFakeNode => ({ ...node, props: mergeProps(node.props, patch), children: [] });

afterEach(() => unmount(ROOT_TAG));

// Any committed node under the tree carrying the probed prop - the three Touchables do not agree
// on WHICH node the style lands on (Opacity folds it onto its inner Animated leaf), and the
// question here is only whether the update arrives at all.
function committedStyleProp(prop: string): unknown {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (node.props[prop] !== undefined) return node.props[prop];
    stack.push(...node.children);
  }
  return undefined;
}

let setStyle: ((style: Record<string, number>) => void) | undefined;

function StyleUpdateApp(): ReactElement {
  const [style, update] = useState<Record<string, number>>({ margin: 1 });
  setStyle = update;
  return (
    <TouchableOpacity style={style}>
      <Text>x</Text>
    </TouchableOpacity>
  );
}

describe('React TouchableOpacity style after mount', () => {
  // why: the cross-adapter control for the Angular freeze. If this goes red, the defect is in the
  // shared Touchable design and every adapter needs the fix; green means it is Angular's own
  // change-detection wiring and the fix belongs there.
  it('a style changed after mount reaches the committed view', async () => {
    mount(ROOT_TAG, <StyleUpdateApp />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(committedStyleProp('margin')).toBe(1);
    expect(committedStyleProp('borderWidth')).toBeUndefined();

    setStyle?.({ margin: 2, borderWidth: 7 });
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(committedStyleProp('borderWidth'), 'the new style must reach the view').toBe(7);
    expect(committedStyleProp('margin'), 'and the changed value must be the new one').toBe(2);
  });
});

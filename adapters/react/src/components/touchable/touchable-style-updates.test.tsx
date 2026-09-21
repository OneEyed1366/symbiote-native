// Does a TouchableOpacity's style stay LIVE after mount, or is it frozen at creation?
//
// This exists because the Angular adapter's TouchableOpacity is frozen: a `[style]` change or a
// class toggled after mount never reaches the committed view, while the press-opacity animation
// keeps working (it rides the Animated leaf, not the prop bag), so the component looks healthy.
// React is the reference adapter, so this file answers "is that shape-specific to Angular, or did
// every adapter inherit it from the shared Touchable design?" - a question worth a test rather
// than an assumption, since all four wrap the same core state machine.
//
// The live tree's `payload` is recomputed on every read from the node's CURRENT authored props
// (`fabricProps(handle, propsOf(handle))`), so a style update after mount just shows up on the
// next read — no clone-protocol mock needed, and none of the mirror's clone-on-write merge
// semantics this file used to have to reproduce by hand.

import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 128;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

afterEach(() => unmount(ROOT_TAG));

// Any committed node under the tree carrying the probed prop - the three Touchables do not agree
// on WHICH node the style lands on (Opacity folds it onto its inner Animated leaf), and the
// question here is only whether the update arrives at all.
function committedStyleProp(prop: string): unknown {
  const stack = [live.nodeOf(live.appRoot())];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (node.payload[prop] !== undefined) return node.payload[prop];
    stack.push(...node.children);
  }
  return undefined;
}

let setStyle: ((style: Record<string, number>) => void) | undefined;

function StyleUpdateApp(): ReactElement {
  const [style, update] = useState<Record<string, number>>({ margin: 1 });
  setStyle = update;
  return (
    <touchable-opacity style={style}>
      <text>x</text>
    </touchable-opacity>
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

    expect(
      committedStyleProp('borderWidth'),
      'the new style must reach the view',
    ).toBe(7);
    expect(
      committedStyleProp('margin'),
      'and the changed value must be the new one',
    ).toBe(2);
  });
});

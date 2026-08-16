// Does a TouchableOpacity's style stay LIVE after mount, or is it frozen at creation?
//
// This exists because the Angular adapter's TouchableOpacity is frozen: a `[style]` change or a
// class toggled after mount never reaches the committed view, while the press-opacity animation
// keeps working (it rides the Animated leaf, not the prop bag), so the component looks healthy.
// The React twin of this file passes, so the defect is not in the shared Touchable design. Vue is
// the closest analogue to Angular - a non-React reconciler driving the same engine through its own
// reactivity - so it is the second data point that says whether this is Angular's alone.
//
// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`.

import { defineComponent, h, ref, type VNode, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, TouchableOpacity, Text } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 731;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Any committed node carrying the probed prop - the Touchables do not agree on WHICH node the
// style lands on (Opacity folds it onto its inner Animated leaf), and the question here is only
// whether the update arrives at all.
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

let boxStyle: Ref<Record<string, number>> | undefined;

const StyleUpdateApp = defineComponent({
  setup() {
    const style = ref<Record<string, number>>({ margin: 1 });
    boxStyle = style;
    return (): VNode => h(TouchableOpacity, { style: style.value }, () => [h(Text, () => ['x'])]);
  },
});

describe('Vue TouchableOpacity style after mount', () => {
  // why: the second cross-adapter control for the Angular freeze. React green + Vue green isolates
  // the defect to Angular's own change-detection wiring; a red here would move it into the shared
  // Touchable design and change who has to fix it.
  it('a style changed after mount reaches the committed view', async () => {
    mount(ROOT_TAG, StyleUpdateApp);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(committedStyleProp('margin')).toBe(1);
    expect(committedStyleProp('borderWidth')).toBeUndefined();

    if (boxStyle !== undefined) boxStyle.value = { margin: 2, borderWidth: 7 };
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(committedStyleProp('borderWidth'), 'the new style must reach the view').toBe(7);
    expect(committedStyleProp('margin'), 'and the changed value must be the new one').toBe(2);
  });
});

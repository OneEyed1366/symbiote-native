// The controlled `<text-input>` handshake, driven through the REAL Vue renderer.
//
// It exists because of a guard added beside it. `@vue/runtime-core` patches `value`
// unconditionally — excluded from its own diff, then patched on its own line — which is a DOM
// workaround: typing mutates `el.value` directly, so only the element knows what it holds. Upstream
// balances it with a guard in `patchDOMProp`; our renderer had the unconditional call and not the
// guard, so every `<text-input>` re-routed its value on every re-render of its parent — 1 000
// writes and ~6 000 wire slots per relabel of the benchmark list, against solid's 0 for the same
// tree. The guard is `key !== 'value' || prev !== next` in `renderer/index.ts`.
//
// Split from the file this once was: the native-write-back handshake (native reports a keystroke,
// the app's UNCHANGED value is commanded back down) needs a real committed Fabric surface —
// `requestCommitFor` routes the recommit through `committedRecordOf(node).rootTag`, which the
// recording host cannot model by design — and moved to
// `core/engine/cpp/tests/js/vue-controlled-input-keeps-its-beat.itest.ts`. What is left here needs
// no tag at all: the guard's OTHER side, that a value the app genuinely changes still reaches the
// node.

import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { registerTextInputBehavior } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from './render';
import './register';

registerTextInputBehavior();

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const ROOT_TAG = 9312;

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const boundValueRef = ref('bound by the app');
// Something on the SURROUNDING markup, so a re-render can touch the tree without touching the
// input — the shape that used to re-route the input's value anyway.
const siblingLabelRef = ref('before');

const Screen = defineComponent({
  name: 'controlled-input-screen',
  setup() {
    return (): VNode =>
      h('view', null, [
        h('text', null, siblingLabelRef.value),
        h('text-input', { value: boundValueRef.value }),
      ]);
  },
});

beforeEach(() => {
  fabric.reset();
  boundValueRef.value = 'bound by the app';
  siblingLabelRef.value = 'before';
});

describe('a controlled text input under the vue renderer', () => {
  // The guard itself, from the side that must still work: a value the app genuinely CHANGES has to
  // reach the node. Without this case, "never write value" would pass silently.
  it('still writes a value the app changes', async () => {
    mount(ROOT_TAG, Screen);
    await flush();

    boundValueRef.value = 'changed by the app';
    await flush();

    const committed = live.findLive(live.appRoot(), node =>
      node.viewName.includes('TextInput'),
    );
    unmount(ROOT_TAG);

    expect(committed).toBeDefined();
    expect(committed?.payload.text).toBe('changed by the app');
  });
});

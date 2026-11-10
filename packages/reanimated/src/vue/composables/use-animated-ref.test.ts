import { getNativeTag } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/vue';
import { defineComponent, h, nextTick } from '@vue/runtime-core';
import { describe, expect, it } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
import { installWrapperHost } from '../../../test-support/wrapper-host';
import type { IAnimatedRef } from '../../core/animated-ref';
import { useAnimatedRef } from './use-animated-ref';

const host = installWrapperHost();
const ROOT_TAG = 15_501;

describe('useAnimatedRef', () => {
  it('has no node and no wrapper before it is passed to a view', () => {
    const composable = renderComposable(() => useAnimatedRef());

    expect(composable.result().current).toBeNull();
    expect(composable.result()()).toBeNull();
  });

  it('gets the node, its tag and its wrapper once passed as the ref of a view', async () => {
    const refs: IAnimatedRef[] = [];
    const Screen = defineComponent({
      setup() {
        const ref = useAnimatedRef();
        refs.push(ref);
        return () => h('view', { ref });
      },
    });

    mount(ROOT_TAG, Screen);
    await nextTick();

    const [ref] = refs;
    const node = ref?.current;
    expect(node).toBeTruthy();
    if (ref === undefined || !node) return;
    expect(ref.getTag()).toBe(getNativeTag(node));
    expect(ref()).toBe(host.wrapperOf(node));
    unmount(ROOT_TAG);
  });
});

import { act, createElement } from 'react';
import { mount, unmount } from '@symbiote-native/react';
import { getNativeTag } from '@symbiote-native/engine';
import { describe, expect, it } from 'vitest';
import type { IAnimatedRef } from '../../core/animated-ref';
import { installWrapperHost } from '../../../test-support/wrapper-host';
import { renderHook } from '../../../test-support/render-hook';
import { useAnimatedRef } from './use-animated-ref';

const host = installWrapperHost();
const ROOT_TAG = 15_001;

describe('useAnimatedRef', () => {
  it('is the same ref on every render', () => {
    const hook = renderHook(() => useAnimatedRef(), undefined);
    const first = hook.latest();

    hook.rerender(undefined);

    expect(hook.latest()).toBe(first);
  });

  it('has no node and no wrapper before it is passed to a view', () => {
    const hook = renderHook(() => useAnimatedRef(), undefined);

    expect(hook.latest().current).toBeNull();
    expect(hook.latest()()).toBeNull();
  });

  it('gets the node, its tag and its wrapper once passed as the ref of a view', () => {
    const refs: IAnimatedRef[] = [];
    function Screen() {
      const ref = useAnimatedRef();
      refs.push(ref);
      return createElement('view', { ref });
    }

    act(() => mount(ROOT_TAG, createElement(Screen)));

    const [ref] = refs;
    const node = ref?.current;
    expect(node).toBeTruthy();
    if (ref === undefined || !node) return;
    expect(ref.getTag()).toBe(getNativeTag(node));
    expect(ref()).toBe(host.wrapperOf(node));
    act(() => unmount(ROOT_TAG));
  });
});

import { h } from '@vue/runtime-core';
import { describe, expect, it } from 'vitest';
import { el } from '@symbiote-native/components';
import { descriptorToVue } from './descriptor-to-vue';

describe('descriptorToVue (Positive)', () => {
  it('puts caller vnodes after the descriptor own children', () => {
    const own = el('image', {});
    const extra = h('text');

    const vnode = descriptorToVue(el('view', {}, [own]), [extra]);

    expect(vnode.type).toBe('view');
    expect(vnode.children).toHaveLength(2);
    expect(Array.isArray(vnode.children) && vnode.children[1]).toBe(extra);
  });

  it('keeps one-argument callers unchanged', () => {
    const vnode = descriptorToVue(el('view', {}, [el('image', {})]));

    expect(vnode.children).toHaveLength(1);
  });
});

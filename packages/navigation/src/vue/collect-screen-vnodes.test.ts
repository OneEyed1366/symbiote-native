import { Fragment, defineComponent, h } from '@vue/runtime-core';
import { describe, expect, it } from 'vitest';
import { collectScreenVnodes } from './collect-screen-vnodes';

const Marker = defineComponent({ name: 'Marker', render: () => null });

function namesOf(found: readonly { props: unknown }[]): unknown[] {
  return found.map(vnode =>
    typeof vnode.props === 'object' &&
    vnode.props !== null &&
    'name' in vnode.props
      ? vnode.props.name
      : undefined,
  );
}

describe('collectScreenVnodes', () => {
  it('finds a marker the slot returns in a plain array, as JSX `.map` does', () => {
    // A compiled slot is not normalized, so `{items.map(...)}` arrives as a bare array
    const slot = [
      h(Marker, { name: 'first' }),
      [h(Marker, { name: 'mapped-a' }), h(Marker, { name: 'mapped-b' })],
      h(Marker, { name: 'last' }),
    ];

    expect(namesOf(collectScreenVnodes(slot, Marker))).toEqual([
      'first',
      'mapped-a',
      'mapped-b',
      'last',
    ]);
  });

  it('finds a marker in a Fragment, as `v-for` yields', () => {
    const slot = [
      h(Fragment, null, [h(Marker, { name: 'a' }), h(Marker, { name: 'b' })]),
    ];

    expect(namesOf(collectScreenVnodes(slot, Marker))).toEqual(['a', 'b']);
  });

  it('finds a marker in an array nested inside a Fragment', () => {
    const slot = [h(Fragment, null, [[h(Marker, { name: 'deep' })]])];

    expect(namesOf(collectScreenVnodes(slot, Marker))).toEqual(['deep']);
  });
});

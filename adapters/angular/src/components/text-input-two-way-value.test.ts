// `[(value)]` is the idiom every Angular template writes for a text field, and nothing in this
// repo covered it end to end: the round trip is native `topChange` -> the component's
// `handleChange` -> `valueChange.emit(text)` -> the parent's own field. Device-reported
// 2026-09-02 as "the field types but the bound value stays frozen" — which is exactly what a
// broken derivation looks like, because native echoes keystrokes on its own.
//
// The oracle is the PARENT's field, not the emitter: an @Output that fires into nothing would
// pass a spy on `valueChange` and still leave `[(value)]` broken.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { TextHost } from '../primitives';
import { TextInput } from './text-input';

const ROOT_TAG = 921;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The binding target lives outside the component so the test can read it without holding the
// instance — `mount` returns the surface, not a ComponentRef.
const model = { name: '' };

@Component({
  selector: 'two-way-host',
  standalone: true,
  imports: [TextInput, TextHost],
  // Mirrors CanaryScreen: the binding AND the sibling interpolation that renders it, so a value
  // that lands on the field but never reaches the tree still fails.
  template: `
    <TextInput [(value)]="state.name" testID="probe" />
    <Text testID="greeting">{{
      state.name ? 'Hello, ' + state.name : 'Hello, stranger'
    }}</Text>
  `,
})
class TwoWayHost {
  readonly state = model;
}

// The committed node the managed tag produced — found by testID so this does not depend on which
// of the two template branches rendered.
interface ICommitted {
  props: Record<string, unknown>;
  children: ICommitted[];
  instanceHandle: unknown;
}

function findByTestID(testID: string): ICommitted {
  const visit = (node: ICommitted): ICommitted | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const hit = visit(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const hit = visit(root as unknown as ICommitted);
    if (hit !== undefined) return hit;
  }
  throw new Error(`no committed node carrying testID="${testID}"`);
}

const probeNode = (): ICommitted => findByTestID('probe');

// The rendered string, read off the committed tree rather than off the component — the greeting is
// what the user actually sees fail.
function committedTextUnder(testID: string): string {
  const node = findByTestID(testID);
  const texts: string[] = [];
  const walk = (n: ICommitted): void => {
    if (typeof n.props.text === 'string') texts.push(n.props.text);
    n.children.forEach(walk);
  };
  walk(node);
  return texts.join('');
}

beforeEach(() => {
  fabric.reset();
  model.name = '';
});
afterEach(() => unmount(ROOT_TAG));

describe('[(value)] on TextInput', () => {
  it('writes the typed text back into the parent field', async () => {
    mount(ROOT_TAG, TwoWayHost);
    await tick();

    fabric.fireEvent(probeNode().instanceHandle, 'topChange', {
      text: 'Andrew',
      eventCount: 1,
    });
    await tick();

    expect(model.name).toBe('Andrew');
    expect(committedTextUnder('greeting')).toBe('Hello, Andrew');
  });
});

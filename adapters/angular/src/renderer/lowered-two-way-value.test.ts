// `[(value)]` on a LOWERED primitive — the spelling every Angular template writes for a Switch or
// a TextInput, and the one the lowering transform refused for a few hours because `valueChange` is
// an @Output the component derives rather than a Fabric event.
//
// It does not need to be a component: both behaviors already call
// `node.props.onValueChange(value, event)`, RN's own spelling of the same fold. The renderer routes
// the binding to that prop, so the two paths agree.
//
// The oracle is the PARENT's field after a native event, not a spy on the callback: a handler that
// fires into nothing would pass a spy and still leave `[(value)]` broken.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import '../register';
import { mount, unmount } from '../render';

const ROOT_TAG = 948;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The binding targets live outside the component so the test can read them without holding the
// instance — `mount` returns the surface, not a ComponentRef.
const model = { text: '', on: false };

@Component({
  selector: 'lowered-two-way-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // Bare intrinsics, no primitive imported: a component in scope would take the tag back through
  // the dual selector and this would silently measure the wrapper instead.
  template: `
    <symbiote-text-input
      testID="input"
      [(value)]="state.text"
    ></symbiote-text-input>
    <symbiote-switch testID="toggle" [(value)]="state.on"></symbiote-switch>
  `,
})
class TwoWayHost {
  readonly state = model;
}

interface ICommitted {
  props: Record<string, unknown>;
  children: ICommitted[];
  instanceHandle: unknown;
}

function committed(testID: string): ICommitted {
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

beforeEach(() => {
  fabric.reset();
  model.text = '';
  model.on = false;
});
afterEach(() => unmount(ROOT_TAG));

describe('[(value)] on a lowered element', () => {
  it('writes the typed text back into the parent field', async () => {
    mount(ROOT_TAG, TwoWayHost);
    await tick();

    fabric.fireEvent(committed('input').instanceHandle, 'topChange', {
      text: 'Andrew',
      eventCount: 1,
    });
    await tick();

    expect(model.text).toBe('Andrew');
  });

  it('writes the toggled boolean back into the parent field', async () => {
    mount(ROOT_TAG, TwoWayHost);
    await tick();

    fabric.fireEvent(committed('toggle').instanceHandle, 'topChange', {
      value: true,
    });
    await tick();

    expect(model.on).toBe(true);
  });
});

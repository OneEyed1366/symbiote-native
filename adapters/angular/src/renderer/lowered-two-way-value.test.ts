// `[(value)]` on a LOWERED primitive — the spelling every Angular template writes for a Switch or
// a TextInput, and the one the lowering transform refused for a few hours because `valueChange` is
// an @Output the component derives rather than a Fabric event.
//
// It does not need to be a component: both behaviors already call
// `node.props.onValueChange(event)`, RN's own spelling of the same fold, with `text`/`value` carried
// as a field on the event. The renderer routes the binding to that prop and unwraps the field back
// to a bare value, so the two paths agree.
//
// The oracle is the PARENT's field after a native event, not a spy on the callback: a handler that
// fires into nothing would pass a spy and still leave `[(value)]` broken.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import '../register';
import { mount, unmount } from '../render';
import { SYMBIOTE_ELEMENTS } from '../elements';

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
    <text-input testID="input" [(value)]="state.text"></text-input>
    <switch testID="toggle" [(value)]="state.on"></switch>
  `,
})
class TwoWayHost {
  readonly state = model;
}

// The same two tags with the element directives IN SCOPE — the shape a real app has, since every
// screen imports SYMBIOTE_ELEMENTS, and the shape the block above deliberately does NOT cover.
// A matched directive declares `valueChange` as an `@Output`, which is what lets ngtsc accept the
// `[(value)]` sugar at all (without it the halves resolve to different targets: NG8007).
//
// What it does NOT change is who delivers. Deleting the directive's own listener bridge leaves
// every case here green: on an ELEMENT Angular attaches the renderer listener for the event
// alongside the output subscription, so the engine still hears it — and the `delivers exactly once`
// case is what says the two paths do not double-fire. Both facts are JIT-measured; the AOT half is
// open, which is why the bridge stays (see ValueChangeElement).
const matchedModel = { text: '', on: false };
const seenValues: boolean[] = [];

@Component({
  selector: 'matched-two-way-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <text-input testID="matched-input" [(value)]="state.text"></text-input>
    <switch testID="matched-toggle" [(value)]="state.on"></switch>
    <switch testID="unbound-toggle"></switch>
    <switch testID="counted-toggle" (valueChange)="seen.push($event)"></switch>
  `,
})
class MatchedTwoWayHost {
  readonly state = matchedModel;
  readonly seen = seenValues;
}

/** The engine node's own props — where `onValueChange` lands; a function prop reaches no payload. */
function nodeProp(testID: string, name: string): unknown {
  const handle: unknown = committed(testID).instanceHandle;
  if (typeof handle !== 'object' || handle === null) return undefined;
  const props: unknown = Reflect.get(handle, 'props');
  if (typeof props !== 'object' || props === null) return undefined;
  return Reflect.get(props, name);
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
  matchedModel.text = '';
  matchedModel.on = false;
  seenValues.length = 0;
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

describe('[(value)] with the element directive matched', () => {
  it('writes both typed values back through the directive bridge', async () => {
    mount(ROOT_TAG, MatchedTwoWayHost);
    await tick();

    fabric.fireEvent(committed('matched-input').instanceHandle, 'topChange', {
      text: 'Andrew',
      eventCount: 1,
    });
    fabric.fireEvent(committed('matched-toggle').instanceHandle, 'topChange', {
      value: true,
    });
    await tick();

    expect(matchedModel.text).toBe('Andrew');
    expect(matchedModel.on).toBe(true);
  });

  // The `.observed` gate. `onValueChange`'s PRESENCE is what a behavior reads to decide a control is
  // driven from outside, so opening the listener for every tag — rather than for the ones something
  // is actually bound to — would change how an unbound `<switch>` behaves.
  it('leaves an unbound tag without the prop the bridge writes', async () => {
    mount(ROOT_TAG, MatchedTwoWayHost);
    await tick();

    expect(typeof nodeProp('matched-toggle', 'onValueChange')).toBe('function');
    expect(nodeProp('unbound-toggle', 'onValueChange')).toBeUndefined();
  });

  it('delivers a bound handler exactly once per change', async () => {
    mount(ROOT_TAG, MatchedTwoWayHost);
    await tick();

    fabric.fireEvent(committed('counted-toggle').instanceHandle, 'topChange', {
      value: true,
    });
    await tick();

    expect(seenValues).toEqual([true]);
  });
});

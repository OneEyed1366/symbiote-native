// Regression coverage for the anchor-vs-real-content class bug (see pressable.test.ts for the
// full writeup): a `class="..."` written on TouchableNativeFeedback's OWN use site always resolves
// through Angular's addClass/removeClass onto its non-painting ANCHOR host, never onto the real
// committed feedback <symbiote-view> one level down. TouchableNativeFeedback has no explicit
// `style`/`class`-forwarding @Input() of its own, so the anchor's class-derived style is the
// ONLY style source hostProps.style forwards.
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { TouchableNativeFeedback } from './index';

const ROOT_TAG = 941;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

@Component({
  selector: 'symbiote-touchable-native-feedback-host',
  standalone: true,
  imports: [TouchableNativeFeedback],
  template: `
    <TouchableNativeFeedback [testID]="'native-feedback'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableNativeFeedback>
  `,
})
class TouchableNativeFeedbackHost {}

describe('TouchableNativeFeedback', () => {
  // why: with no explicit style/class @Input of its own, the anchor's class-derived style is the
  // ONLY style source hostProps.style forwards — if the anchor merge is missing, a class= at the
  // use site has no other path onto the real committed feedback view at all.
  it('resolves a class= on the TouchableNativeFeedback use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableNativeFeedbackHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'native-feedback');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

// Fabric is clone-on-write: a prop update yields a NEW node in the committed tree, never in
// `created`, so a post-mutation assertion must walk the live committed child set.
function findCommitted(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (predicate(node)) return node;
    stack.push(...node.children);
  }
  return undefined;
}

let toggleHost: ClassToggleHost | undefined;

@Component({
  selector: 'symbiote-tnf-class-toggle-host',
  standalone: true,
  imports: [TouchableNativeFeedback],
  template: `
    <TouchableNativeFeedback [testID]="'toggle'" [class.on]="on()">
      <symbiote-text>Press</symbiote-text>
    </TouchableNativeFeedback>
  `,
})
class ClassToggleHost {
  on = signal(false);

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    toggleHost = this;
  }
}

describe('TouchableNativeFeedback memoized hostProps stays correct', () => {
  // why: `hostProps` is a computed(), and the anchor's class-derived style is its ONE dependency
  // that is not an @Input — the renderer writes it through addClass/removeClass, so it never
  // reaches SimpleChanges and the inputsRevision bump cannot see it. Without the ngDoCheck poll
  // that feeds the anchorStyle signal, the memoized bag serves the pre-toggle style forever and a
  // class toggled after mount never repaints. Verified to fail when that poll is removed.
  it('picks up a class toggled after mount, with no @Input change', async () => {
    registerStyles({ on: { backgroundColor: 'lime' } });

    mount(ROOT_TAG, ClassToggleHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(findCommitted(n => n.props.testID === 'toggle')?.props.backgroundColor).toBeUndefined();

    toggleHost?.on.set(true);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(findCommitted(n => n.props.testID === 'toggle')?.props.backgroundColor).toBe('lime');
  });
});

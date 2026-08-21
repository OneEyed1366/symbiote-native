// The touch->press synthesis itself (start/move/end -> pressIn/press/pressOut, responder
// negotiation) is framework-agnostic engine logic (core/engine/src/events/index.ts), shared by
// every adapter — this file does not re-derive its edge cases. What is Angular-specific and
// exercised here: the (press)/(pressIn)/(pressOut) @Output wiring end to end, and the anchor
// `class=` resolution — Pressable renders directly onto its own primitive (not through
// DescriptorOutlet), so a class= lands on the same node the touch events fire at.
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Pressable } from './index';

const ROOT_TAG = 903;
const fabric = installFabric();

let capturedHost: PressableHost | undefined;

@Component({
  selector: 'symbiote-pressable-host',
  standalone: true,
  imports: [Pressable],
  template: `
    <Pressable
      [testID]="'pressable'"
      class="card"
      (press)="onPress($event)"
      (pressIn)="onPressIn($event)"
      (pressOut)="onPressOut($event)"
    >
      <symbiote-text>Press me</symbiote-text>
    </Pressable>
  `,
})
class PressableHost {
  onPress = vi.fn();
  onPressIn = vi.fn();
  onPressOut = vi.fn();

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

// why: contract-accurate group name — nothing here throws. A touch sequence always resolves to
// the matching lifecycle Outputs, and the class merge always resolves to a style value.
describe('Pressable (no throwing path — see file header)', () => {
  it('synthesizes a press from a touch sequence and fires the lifecycle handlers', async () => {
    mount(ROOT_TAG, PressableHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'pressable');
    expect(node, 'Pressable view committed').toBeDefined();

    const now = Date.now();
    const touch = { identifier: 1, pageX: 10, pageY: 10, timestamp: now };
    const nativeEvent = { touches: [touch], changedTouches: [touch] };

    fabric.fireEvent(node?.instanceHandle, 'topTouchStart', nativeEvent);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(capturedHost?.onPressIn).toHaveBeenCalledOnce();

    fabric.fireEvent(node?.instanceHandle, 'topTouchEnd', nativeEvent);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(capturedHost?.onPress).toHaveBeenCalledOnce();
    expect(capturedHost?.onPressOut).toHaveBeenCalledOnce();
  });

  it('resolves a class= on the Pressable use site onto the real committed view, not the anchor', async () => {
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'red' },
      },
    ]);

    mount(ROOT_TAG, PressableHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'pressable');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

// Fabric is clone-on-write: a prop update yields a NEW node in the committed tree, never in
// `created`, so a post-mutation assertion must walk the live committed child set.
function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (predicate(node)) return node;
    stack.push(...node.children);
  }
  return undefined;
}

let memoHost: MemoHost | undefined;

@Component({
  selector: 'symbiote-pressable-memo-host',
  standalone: true,
  imports: [Pressable],
  template: `<Pressable
    [testID]="'memo'"
    [class.on]="on()"
    [style]="explicit()"
  ></Pressable>`,
})
class MemoHost {
  on = signal(false);
  explicit = signal<Record<string, unknown> | undefined>(undefined);

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    memoHost = this;
  }
}

// `hostProps` is a computed(), so an unchanged bag keeps its reference and skips the whole
// Renderer2.setProperty push. That memoization is only correct while EVERY dependency of the bag
// is reactive, and its two non-@Input dependencies are the ones that can silently rot: the
// anchor's class-derived style (written by the renderer's addClass/removeClass, never visible in
// SimpleChanges — polled into a signal by ngDoCheck) and the press machine's `pressed` flag
// (mutated outside Angular entirely — its own signal). A regression in either shows up here as a
// paint that never lands, which is far harder to spot than the churn the memoization removes.
describe('Pressable memoized hostProps stays correct', () => {
  // why: a class toggle never reaches ngOnChanges — the renderer writes the anchor's class-derived
  // style through addClass/removeClass, so it never lands in SimpleChanges and the inputsRevision
  // bump cannot see it. Without the ngDoCheck poll feeding the anchorStyle signal, the memoized bag
  // serves the pre-toggle style forever. Verified: removing that poll turns this test red (and the
  // static-class test above with it).
  it('forwards a dynamic [class.on] toggle onto the committed view', async () => {
    registerRules([
      {
        tokens: ['on'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'lime' },
      },
    ]);
    mount(ROOT_TAG, MemoHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(
      findCommitted(n => n.props.testID === 'memo')?.props.backgroundColor,
    ).toBeUndefined();

    memoHost?.on.set(true);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(
      findCommitted(n => n.props.testID === 'memo')?.props.backgroundColor,
    ).toBe('lime');
  });

  // why: the @Input half of the same bag — proves inputsRevision actually invalidates it.
  it('forwards a changed [style] @Input onto the committed view', async () => {
    mount(ROOT_TAG, MemoHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    memoHost?.explicit.set({ opacity: 0.5 });
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(findCommitted(n => n.props.testID === 'memo')?.props.opacity).toBe(
      0.5,
    );
  });

  // why: `pressed` is mutated by the press machine, outside Angular's input system entirely. If it
  // stopped being a signal the highlight would freeze at its mount-time value — a dead press
  // highlight, the exact failure mode memoizing a stateful bag invites.
  it('recomputes a style-as-function when the press machine flips `pressed`', async () => {
    mount(ROOT_TAG, PressedStyleHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'pressed-style');
    expect(
      findCommitted(n => n.props.testID === 'pressed-style')?.props.opacity,
    ).toBe(1);

    const now = Date.now();
    const touch = { identifier: 1, pageX: 10, pageY: 10, timestamp: now };
    fabric.fireEvent(node?.instanceHandle, 'topTouchStart', {
      touches: [touch],
      changedTouches: [touch],
    });
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(
      findCommitted(n => n.props.testID === 'pressed-style')?.props.opacity,
    ).toBe(0.2);
  });
});

@Component({
  selector: 'symbiote-pressable-pressed-style-host',
  standalone: true,
  imports: [Pressable],
  template: `<Pressable
    [testID]="'pressed-style'"
    [style]="pressedStyle"
  ></Pressable>`,
})
class PressedStyleHost {
  // A stable arrow (TouchableHighlight's shape) so the @Input reference never moves — the only
  // thing that can invalidate the bag here is the `pressed` signal itself.
  pressedStyle = (state: { pressed: boolean }): Record<string, unknown> => ({
    opacity: state.pressed ? 0.2 : 1,
  });
}

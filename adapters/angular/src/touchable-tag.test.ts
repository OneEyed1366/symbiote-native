// `touchable-opacity` / `touchable-highlight` / `touchable-without-feedback` as TAGS. All three
// extend `PressableElement` (`elements.ts`) the same way `button` extends `TouchableOpacityElement`
// — same registration shape as `button-tag.test.ts`, reused here.
//
// RN-parity sweep (symbiote-rn-parity-sweep skill): before this file Angular had ZERO tests for any
// of the three (only prop types), the biggest gap found for this component family — React/Vue/Solid
// all had SOME coverage, Angular had none. Also closes lesson 6 (a disabled test that only checks
// style/accessibilityState doesn't prove `onPress` is actually suppressed — needs a real touch).
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_972;
const MAX_SETTLE_TICKS = 20;
const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await tick();
    const current = fabric.counts.completeRoot;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error('the tree never settled');
}

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

function hostOf(label: string): IFakeNode {
  const host = flatten(fabric.appRoot().children).find(
    node => node.props.nativeID === label,
  );
  if (host === undefined) throw new Error(`no committed host ${label}`);
  return host;
}

function press(node: IFakeNode): void {
  fabric.fireEvent(node.instanceHandle, 'topTouchStart', {});
  fabric.fireEvent(node.instanceHandle, 'topTouchEnd', {});
}

let fixtureId = 0;

async function mountTemplate(
  template: string,
  bindings: Record<string, unknown> = {},
): Promise<void> {
  fixtureId += 1;
  @Component({
    selector: `touchable-tag-fixture-${fixtureId}`,
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template,
  })
  class Fixture {
    [key: string]: unknown;
    constructor() {
      Object.assign(this, bindings);
    }
  }

  mount(ROOT_TAG, Fixture satisfies Type<unknown>);
  await flushUntilSettled();
}

// TouchableOpacity's release path fades back through a real Animated.timing (deactivate ->
// fadeTo), which needs requestAnimationFrame — absent by default in this headless environment,
// unlike disabled-only presses (button-tag.test.ts's), which never reach deactivate at all.
function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      return Number(setTimeout(() => callback(Date.now()), 0));
    },
    cancelAnimationFrame(id: number): void {
      clearTimeout(id);
    },
  });
}

beforeEach(() => {
  fabric.reset();
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

describe('Angular: `touchable-opacity` as a tag', () => {
  it('fires onPress from a real touch', async () => {
    let presses = 0;
    await mountTemplate(
      `<touchable-opacity id="t" [onPress]="onPress"></touchable-opacity>`,
      { onPress: () => (presses += 1) },
    );
    press(hostOf('t'));
    expect(presses).toBe(1);
  });

  // why: a disabled test that only checks style/accessibilityState doesn't prove `onPress` is
  // actually gated — RN's own itest fires a real touch for this exact reason (lesson 6).
  it('suppresses onPress from a real touch while disabled', async () => {
    let presses = 0;
    await mountTemplate(
      `<touchable-opacity id="t" [disabled]="true" [onPress]="onPress"></touchable-opacity>`,
      { onPress: () => (presses += 1) },
    );
    press(hostOf('t'));
    expect(presses).toBe(0);
  });

  it('refuses focus while disabled, opt-in notwithstanding', async () => {
    await mountTemplate(
      `<touchable-opacity id="t" [disabled]="true" [focusable]="true" [onPress]="onPress"></touchable-opacity>`,
      { onPress: () => {} },
    );
    expect(hostOf('t').props.focusable).toBe(false);
  });
});

describe('Angular: `touchable-highlight` as a tag', () => {
  // why: RN splits the underlay backgroundColor and the lowered opacity across the container and
  // its cloned child (TouchableHighlight.js, confirmed against `TouchableHighlight-itest.js`'s own
  // two-node shape) — fixed at the engine level via `onChildInserted`
  // (core/components/src/behaviors/touchable-highlight.ts) 2026-09-15.
  it('paints the underlay on the container and the opacity on the child while pressed', async () => {
    await mountTemplate(
      `<touchable-highlight id="t" [onPress]="onPress"><view id="t-child"></view></touchable-highlight>`,
      { onPress: () => {} },
    );
    fabric.fireEvent(hostOf('t').instanceHandle, 'topTouchStart', {});
    await flushUntilSettled();

    const host = hostOf('t');
    expect(host.props.backgroundColor).toBe('black');
    expect(host.props.opacity).toBeUndefined();
    expect(hostOf('t-child').props.opacity).toBe(0.85);
  });

  it('paints no underlay when no press handler is supplied', async () => {
    await mountTemplate(`<touchable-highlight id="t"></touchable-highlight>`);
    fabric.fireEvent(hostOf('t').instanceHandle, 'topTouchStart', {});
    await flushUntilSettled();

    expect(hostOf('t').props.backgroundColor).toBeUndefined();
  });

  it('suppresses onPress from a real touch while disabled', async () => {
    let presses = 0;
    await mountTemplate(
      `<touchable-highlight id="t" [disabled]="true" [onPress]="onPress"></touchable-highlight>`,
      { onPress: () => (presses += 1) },
    );
    press(hostOf('t'));
    expect(presses).toBe(0);
  });

  it('focuses only while it has an onPress and is enabled', async () => {
    await mountTemplate(`<touchable-highlight id="t"></touchable-highlight>`);
    expect(hostOf('t').props.focusable).toBe(false);
  });
});

// The universal gap: React/Vue/Solid/Svelte and Angular all had ZERO bridge tests for this
// component before this sweep, despite core (`behaviors/touchable-without-feedback.ts`+test) fully
// implementing the same accessible/focusable/accessibilityState fold as TouchableHighlight.
//
// TWF renders NO view of its own (TouchableWithoutFeedback.js:229,286) — it clones its props onto
// its single child, so every fixture here needs a real child. `nativeID` is a COMPUTED clone
// (touchable-without-feedback.ts:105-113), read from the OWNER unconditionally — unlike the
// CLONED_WHEN_SET list, it does NOT fall back to whatever `nativeID` the child already had. So the
// `id` that `hostOf` searches for goes on the OWNER tag, not the child (confirmed by dumping the
// committed tree: a child-side `id` was silently dropped, the owner-side one survives the clone).
describe('Angular: `touchable-without-feedback` as a tag', () => {
  it('fires onPress from a real touch', async () => {
    let presses = 0;
    await mountTemplate(
      `<touchable-without-feedback id="t" [onPress]="onPress"><view></view></touchable-without-feedback>`,
      { onPress: () => (presses += 1) },
    );
    press(hostOf('t'));
    expect(presses).toBe(1);
  });

  it('suppresses onPress from a real touch while disabled', async () => {
    let presses = 0;
    await mountTemplate(
      `<touchable-without-feedback id="t" [disabled]="true" [onPress]="onPress"><view></view></touchable-without-feedback>`,
      { onPress: () => (presses += 1) },
    );
    press(hostOf('t'));
    expect(presses).toBe(0);
  });

  it('computes focusable and accessibilityState from disabled', async () => {
    await mountTemplate(
      `<touchable-without-feedback id="t" [disabled]="true" [onPress]="onPress"><view></view></touchable-without-feedback>`,
      { onPress: () => {} },
    );
    const host = hostOf('t');
    expect(host.props.focusable).toBe(false);
    expect(host.props.accessibilityState).toMatchObject({ disabled: true });
  });
});

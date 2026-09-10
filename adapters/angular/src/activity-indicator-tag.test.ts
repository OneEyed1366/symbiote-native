// `activity-indicator` as a TAG, measured through Angular's own renderer. RN's ActivityIndicator is
// a centering `<View>` around a native spinner (ActivityIndicator.js:112) and takes no children, so
// the wrapper this replaces was composition the engine behavior now owns
// (`core/components/src/behaviors/activity-indicator/`).
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE, unlike `touchable-native-feedback-tag.test.ts`'s,
// whose tag commits nothing whether or not a behavior is attached. An unregistered
// `activity-indicator` commits ONE bare RCTView with no children, so the subtree assertion fails on
// the registration alone — and the payload assertions fail with it, which is the
// two-consequences-of-one-cause shape (`.claude/rules/test-harness-false-greens.md` §14).
//
// The fixture imports `SYMBIOTE_ELEMENTS` and declares no schema, which is the shape an app writes.
// This file runs JIT, so it answers what the renderer DOES, not what the compiler accepts
// (`.claude/rules/test-harness-false-greens.md` §21).
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the spinner. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_976;
const MAX_SETTLE_TICKS = 20;
const fabric = installFabric();

// RN's iOS default (`ActivityIndicator.js:25`, GRAY) and its fixed box for the named large size.
const IOS_DEFAULT_COLOR = '#999999';
const SIZE_LARGE_PX = 36;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Sampled rather than a fixed count, mirroring `button-tag.test.ts`: a half-built tree is
// indistinguishable from a subtree the behavior never built.
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

// The centering host, found through its CHILD. `nativeID` is one of the props RN moves onto the
// spinner, so a label-keyed lookup lands on the spinner and the host is its parent — which is also
// the first thing this test asserts about the split.
function hostOf(label: string): IFakeNode {
  const committed = flatten(fabric.appRoot().children);
  const spinner = committed.find(node => node.props.nativeID === label);
  if (spinner === undefined) throw new Error(`no committed spinner ${label}`);
  const host = committed.find(node => node.children.includes(spinner));
  // Unregistered, the label stays on the tag's own node and there is no parent under the root to
  // find — so this is where a missing `./register` lands, and the message says so rather than
  // reading as a broken locator.
  if (host === undefined)
    throw new Error(
      `${label} committed no spinner under a host — is the behavior registered?`,
    );
  return host;
}

async function mountTemplate(template: string): Promise<void> {
  @Component({
    // Unique per file: a repeated selector makes Angular log an NG0912 component-id collision.
    selector: 'activity-indicator-tag-fixture',
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template,
  })
  class Fixture {}

  mount(ROOT_TAG, Fixture satisfies Type<unknown>);
  await flushUntilSettled();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular: `activity-indicator` as a tag', () => {
  it('commits RN’s two-node tree and folds the size onto the spinner', async () => {
    await mountTemplate(
      `<activity-indicator id="ind" size="large"></activity-indicator>`,
    );

    // The host is the centering view and the spinner is its only child — the second node exists
    // only because the behavior built it, so this is what fails when `./register` is dropped.
    const host = hostOf('ind');
    expect(host.viewName).toBe('RCTView');
    expect(host.props).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(host.children.map(node => node.viewName)).toEqual([
      'ActivityIndicatorView',
    ]);

    // RN maps a NAMED size to both the native enum and a fixed box; the defaults have no
    // destructure to come from on a tag, so the fold is what supplies them.
    expect(host.children[0].props).toMatchObject({
      size: 'large',
      width: SIZE_LARGE_PX,
      height: SIZE_LARGE_PX,
      animating: true,
      hidesWhenStopped: true,
      color: IOS_DEFAULT_COLOR,
    });
  });

  // why: RN spreads `...restProps` onto the SPINNER and keeps only `onLayout`/`style` on the View
  // (ActivityIndicator.js:99,113). A prop landing on the wrong node is invisible to any assertion
  // that only checks the tree it DID reach, so both sides are pinned.
  it('routes an app prop to the spinner and keeps the style on the host', async () => {
    await mountTemplate(
      `<activity-indicator id="ind" testID="spin" [style]="{ margin: 4 }"></activity-indicator>`,
    );

    const host = hostOf('ind');
    expect(host.props.margin).toBe(4);
    expect(Object.hasOwn(host.props, 'testID')).toBe(false);
    expect(host.children[0].props.testID).toBe('spin');
  });
});

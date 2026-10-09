// `activity-indicator` as a TAG, measured through React's own reconciler. RN's ActivityIndicator is
// a centering `<view>` wrapped around a native spinner (ActivityIndicator.js:112) and takes no
// children, so the wrapper this replaces was composition the engine behavior now owns
// (`core/components/src/behaviors/activity-indicator/`).
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE. An unregistered `activity-indicator` commits ONE
// bare RCTView with no children and every app prop raw on it, so the subtree assertion fails on the
// registration alone — and the payload assertions fail with it, which is the
// two-consequences-of-one-cause shape (`.claude/rules/test-harness-false-greens.md` §14).
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the spinner. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import { parentOf } from '@symbiote-native/engine';
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_974;
const fabric = installRecordingFabric();
// The behavior FOLDS the label onto the spinner, so every read here is `.payload`.
const live = createLiveTree(fabric);

// The centering host, found through its CHILD. `nativeID` is one of the props RN moves onto the
// spinner, so a label-keyed lookup lands on the spinner and the host is its parent — which is also
// the first thing this test asserts about the split.
function hostOf(label: string): ILiveNode {
  const spinner = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  if (spinner === undefined) throw new Error(`no committed spinner ${label}`);
  const host = parentOf(spinner.handle);
  // Unregistered, the label stays on the tag's own node and there is no parent under the root to
  // find — so this is where a missing `./register` lands, and the message says so rather than
  // reading as a broken locator.
  if (host === undefined)
    throw new Error(
      `${label} committed no spinner under a host — is the behavior registered?`,
    );
  return live.nodeOf(host);
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('React: `activity-indicator` as a tag', () => {
  it('commits RN’s two-node tree from the tag alone', () => {
    mount(
      ROOT_TAG,
      createElement('activity-indicator', { nativeID: 'ind', size: 'large' }),
    );

    // The host is the centering view and the spinner is the only child — the second node exists
    // only because the behavior built it, so this is what fails when `./register` is dropped.
    const host = hostOf('ind');
    expect(host.viewName).toBe('RCTView');
    // The payload rules are `activity-indicator-payload.itest.ts`'s, this host has no copy
    expect(host.children.map(node => node.viewName)).toEqual([
      'ActivityIndicatorView',
    ]);
  });

  // RN spreads `restProps` onto the spinner and keeps only `onLayout` and `style` on the View
  it('routes an app prop to the spinner and keeps the style on the host', () => {
    mount(
      ROOT_TAG,
      createElement('activity-indicator', {
        nativeID: 'ind',
        testID: 'spin',
        style: { margin: 4 },
      }),
    );

    const host = hostOf('ind');
    expect(host.payload.margin).toBe(4);
    expect(Object.hasOwn(host.payload, 'testID')).toBe(false);
    expect(host.children[0].payload.testID).toBe('spin');
  });

  it('puts accessibilityLabel on the spinner, not on the host', () => {
    mount(
      ROOT_TAG,
      createElement('activity-indicator', {
        nativeID: 'ind',
        accessibilityLabel: 'Loading content',
      }),
    );

    const host = hostOf('ind');
    expect(host.children[0].payload.accessibilityLabel).toBe('Loading content');
    expect(Object.hasOwn(host.payload, 'accessibilityLabel')).toBe(false);
  });
});

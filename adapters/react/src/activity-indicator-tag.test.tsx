// `activity-indicator` as a TAG, measured through React's own reconciler. RN's ActivityIndicator is
// a centering `<View>` wrapped around a native spinner (ActivityIndicator.js:112) and takes no
// children, so the wrapper this replaces was composition the engine behavior now owns
// (`core/components/src/behaviors/activity-indicator/`).
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE. An unregistered `activity-indicator` commits ONE
// bare RCTView with no children and every app prop raw on it, so the subtree assertion fails on the
// registration alone — and the payload assertions fail with it, which is the
// two-consequences-of-one-cause shape (`.claude/rules/test-harness-false-greens.md` §14).
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the spinner. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_974;
const fabric = installFabric();

// RN's iOS default (`ActivityIndicator.js:25`, GRAY) and its fixed box for the named large size.
const IOS_DEFAULT_COLOR = '#999999';
const SIZE_LARGE_PX = 36;

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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('React: `activity-indicator` as a tag', () => {
  it('commits RN’s two-node tree and folds the size onto the spinner', () => {
    mount(
      ROOT_TAG,
      createElement('activity-indicator', { nativeID: 'ind', size: 'large' }),
    );

    // The host is the centering view and the spinner is the only child — the second node exists
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

    const spinner = host.children[0];
    // RN maps a NAMED size to both the native enum and a fixed box; the defaults have no
    // destructure to come from on a tag, so the fold is what supplies them.
    expect(spinner.props).toMatchObject({
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
    expect(host.props.margin).toBe(4);
    expect(Object.hasOwn(host.props, 'testID')).toBe(false);
    expect(host.children[0].props.testID).toBe('spin');
  });
});

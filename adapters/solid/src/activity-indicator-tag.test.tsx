// `activity-indicator` as a TAG, through Solid's own renderer — the suite that was
// `components/activity-indicator/activity-indicator.test.tsx` while a wrapper existed. RN's
// ActivityIndicator is a centering `<View>` around a native spinner (ActivityIndicator.js:112) and
// takes no children, so the wrapper had nothing left to do once
// `core/components/src/behaviors/activity-indicator/` built the same pair on the engine node.
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE. An unregistered `activity-indicator` commits ONE
// bare RCTView with no children and every app prop raw on it, so the subtree assertion fails on the
// registration alone.
//
// Every lookup goes through the live committed tree — the creation record freezes props at first
// commit (`.claude/rules/test-harness-false-greens.md` §2).
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parentOf } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the spinner. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 844;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// RN's iOS default (`ActivityIndicator.js:25`, GRAY) and its fixed box for the named large size.
const IOS_DEFAULT_COLOR = '#999999';
const SIZE_LARGE_PX = 36;

// The centering host, found through its CHILD. `nativeID` is one of the props RN moves onto the
// spinner, so a label-keyed lookup lands on the spinner and the host is its PARENT — which is also
// the first thing this test asserts about the split. Read via `parentOf`, not a `children.includes`
// scan: `children` is a live getter, so `===` never matches across two reads of it.
function hostOf(label: string): ILiveNode {
  const spinner = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  // Unregistered, the label stays on the tag's own node and there is no parent under the root to
  // find — so this is where a missing `./register` lands, and the message says so rather than
  // reading as a broken locator.
  if (spinner === undefined)
    throw new Error(
      `${label} committed no spinner under a host — is the behavior registered?`,
    );
  const host = parentOf(spinner.handle);
  if (host === undefined)
    throw new Error(
      `${label} committed no spinner under a host — is the behavior registered?`,
    );
  return live.nodeOf(host);
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Solid: `activity-indicator` as a tag', () => {
  it('commits RN’s two-node tree and folds the size onto the spinner', async () => {
    mount(ROOT_TAG, () => <activity-indicator nativeID="ind" size="large" />);
    await tick();

    // The host is the centering view and the spinner is the only child — the second node exists
    // only because the behavior built it, so this is what fails when `./register` is dropped.
    const host = hostOf('ind');
    expect(host.viewName).toBe('RCTView');
    expect(host.payload).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(host.children.map(node => node.viewName)).toEqual([
      'ActivityIndicatorView',
    ]);

    // RN maps a NAMED size to both the native enum and a fixed box; the defaults have no
    // destructure to come from on a tag, so the fold is what supplies them.
    expect(host.children[0].payload).toMatchObject({
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
    mount(ROOT_TAG, () => (
      <activity-indicator nativeID="ind" testID="spin" style={{ margin: 4 }} />
    ));
    await tick();

    const host = hostOf('ind');
    expect(host.payload.margin).toBe(4);
    expect(Object.hasOwn(host.payload, 'testID')).toBe(false);
    expect(host.children[0].payload.testID).toBe('spin');
  });

  // why: Solid runs a component body ONCE, so a prop read at setup freezes. `animating` is read
  // inside the behavior's fold, which re-runs on the SAME spinner node — the identity assertion is
  // the other half, since rebuilding the spinner would restart the native animation.
  it('repaints the same spinner when animating flips after mount', async () => {
    const [animating, setAnimating] = createSignal(true);
    mount(ROOT_TAG, () => (
      <activity-indicator nativeID="ind" animating={animating()} />
    ));
    await tick();
    const spinnerAtMount = hostOf('ind').children[0].handle;

    setAnimating(false);
    await tick();

    const host = hostOf('ind');
    expect(host.children[0].payload.animating).toBe(false);
    expect(host.children[0].handle, 'the spinner kept its identity').toBe(
      spinnerAtMount,
    );
  });
});

// WHICH props can be read back off the committed tree, measured rather than assumed.
//
// `getDebugProps` is a hand-written selection per component, so an ABSENT key proves nothing —
// that caveat is already on `IMountedView.props`. What the caveat does not say is which keys are
// PRESENT, and the 315 files still reading a stand-in need that list to know which of them this
// harness can answer at all. So this file sets a wide spread of props on one view and asserts the
// keys that came back, making the selection a fact in the suite rather than folklore.
//
// A red test here is a finding either way: a key that stops arriving is a renderer change, and a
// key that starts arriving widens what can be migrated.
//
// No Negative group: reading props throws for nothing — an unparsed value leaves the field at its
// default, which `processor-refusal.itest.ts` covers.

import { createElement, createSurface, setProp } from '@symbiote-native/engine';

import {
  committedShape,
  describe,
  expect,
  findCommitted,
  it,
  mounted,
  print,
  report,
  shapeOf,
} from './harness';

const PROBE_ID = 'probe';

function commitProbe(props: Record<string, unknown>) {
  const surface = createSurface(1);
  const view = createElement('RCTView');
  setProp(view, 'testID', PROBE_ID);
  for (const [name, value] of Object.entries(props)) setProp(view, name, value);
  surface.appendChild(view);
  surface.commit();
  return findCommitted(node => node.props.testID === PROBE_ID);
}

describe('what the committed tree hands back', () => {
  // why: the list itself, measured. These seven are what the 315 files can be migrated against —
  // `testID` / `nativeID` are how nearly every one of them locates a node, and the other five are
  // what they then assert on. Printed as well as asserted, so a renderer change reads as a line in
  // the run output rather than only as a failed equality.
  it('hands back every view prop it was set, except the ones outside the selection', () => {
    const probe = commitProbe({
      opacity: 0.5,
      backgroundColor: 'red',
      pointerEvents: 'box-only',
      nativeID: 'native',
      accessible: true,
      zIndex: 3,
      transformOrigin: '10px 10px',
    });

    if (probe === undefined) throw new Error('the probe view did not commit');
    print(`committed view props: ${Object.keys(probe.props).sort().join(' ')}`);

    expect(Object.keys(probe.props).sort().join(' ')).toBe(
      'accessible backgroundColor nativeID opacity pointerEvents testID zIndex',
    );
  });

  // why: the caveat, held as a test rather than as a sentence in a comment. `transformOrigin` IS a
  // real `BaseViewProps` field and it IS set above — it simply is not in `getDebugProps`'s
  // selection, so its absence here says nothing about whether it reached the renderer. A file that
  // reads an absent key as "the prop did not arrive" is measuring this list, not the engine.
  it('omits a prop that reached the renderer but is outside the selection', () => {
    const probe = commitProbe({ transformOrigin: '10px 10px' });

    if (probe === undefined) throw new Error('the probe view did not commit');
    expect(probe.props.transformOrigin).toBe(undefined);
  });

  // why: the committed tree holds what the platform never sees. A view with nothing on it is
  // flattened away, so it is absent from `mounted()` and present here — which is what makes this
  // the right reader for "did the engine send it" and the wrong one for "what does the host hold".
  it('holds a view that flattening keeps off the platform', () => {
    const surface = createSurface(1);
    const bare = createElement('RCTView');
    surface.appendChild(bare);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View()))');
    expect(shapeOf(mounted())).toBe('RootView()');
  });

  // why: the vocabulary is finite and silent when it runs out — an unregistered component name
  // falls back to a plain View rather than failing, so a test naming one reads as a wrong shape.
  // These two are the ones that took a build change to reach (`Modal` and `Image` need React
  // Native's codegen'd core spec), so a regression in that wiring has to be visible here rather
  // than as a puzzling `View` somewhere downstream.
  it('commits the components whose descriptors are registered, under their own names', () => {
    const surface = createSurface(1);
    const image = createElement('RCTImageView');
    setProp(image, 'testID', 'image');
    const modal = createElement('RCTModalHostView');
    setProp(modal, 'testID', 'modal');
    surface.appendChild(image);
    surface.appendChild(modal);
    surface.commit();

    expect(findCommitted(one => one.props.testID === 'image')?.viewName).toBe(
      'Image',
    );
    expect(findCommitted(one => one.props.testID === 'modal')?.viewName).toBe(
      'ModalHostView',
    );
  });
});

report();

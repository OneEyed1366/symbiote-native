// The prop folds a wrapper body used to run, asserted on the COMMITTED payload of a tag.
//
// Every assertion is on the payload rather than on `node.props`, because the failure mode is
// precisely that the raw prop sits on the node looking correct while the folded one never reaches
// Fabric.
import { describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
import {
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { registerPressableBehavior, PRESSABLE_TAG } from './pressable';
import { registerTextInputBehavior, TEXT_INPUT_TAG } from './text-input';

const fabric = installRecordingFabric();
// `.payload` throughout: a fold runs on the way into what Fabric is handed, and the author's bag
// deliberately keeps the aliases it folded from.
const live = createLiveTree(fabric);
registerPressableBehavior();
registerTextInputBehavior();

let nextRootTag = 9600;

// PRODUCTION SHAPE — the Fabric view name as the component, the intrinsic tag third. Passing the
// tag AS the component matches the behavior registry by accident and leaves every case green over
// a registration that can never fire in an app (`.claude/rules/test-harness-false-greens.md` §11).
const TEXT_INPUT_VIEW = 'RCTSinglelineTextInputView';
const PRESSABLE_VIEW = 'RCTView';
const TEST_ID = 'subject';

function commitTag(
  view: string,
  tag: string,
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const node: ISymbioteNode = createElement(view, false, tag);
  routeProp(node, 'testID', TEST_ID);
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();

  // The node itself, never an app-root lookup: every case here opens a fresh surface and the
  // recording is never reset between them, so `appRoot()` would answer with the FIRST case's tree
  // for every case after it — green on case one and quietly wrong after.
  //
  // `.payload` because the fold is what this file is about: it runs on the way INTO what Fabric is
  // handed, and the author's bag deliberately still carries the aliases.
  return live.nodeOf(node).payload;
}

describe('a text-input tag folds the W3C aliases', () => {
  it('maps inputMode / readOnly / enterKeyHint onto the native props', () => {
    const props = commitTag(TEXT_INPUT_VIEW, TEXT_INPUT_TAG, {
      inputMode: 'numeric',
      readOnly: true,
      enterKeyHint: 'search',
    });

    expect(props.keyboardType).toBe('number-pad');
    // `readOnly` is the INVERSE of `editable`, which is the half a hand-written fold gets wrong.
    expect(props.editable).toBe(false);
    expect(props.returnKeyType).toBe('search');
  });

  it('does not send the raw aliases, which no ViewConfig declares', () => {
    const props = commitTag(TEXT_INPUT_VIEW, TEXT_INPUT_TAG, {
      inputMode: 'numeric',
      readOnly: true,
      enterKeyHint: 'search',
      blurOnSubmit: false,
    });

    expect(Object.keys(props)).not.toContain('inputMode');
    expect(Object.keys(props)).not.toContain('readOnly');
    expect(Object.keys(props)).not.toContain('enterKeyHint');
    expect(Object.keys(props)).not.toContain('blurOnSubmit');
  });

  it('carries the defaults the wrapper carries', () => {
    const props = commitTag(TEXT_INPUT_VIEW, TEXT_INPUT_TAG, {});

    expect(props.submitBehavior).toBe('blurAndSubmit');
    // F-76: Android-only default (headless resolves iOS, where no ViewConfig declares this key —
    // `resolveTextInputProps`'s own tests price the Android branch directly).
    expect(props.underlineColorAndroid).toBeUndefined();
  });
});

describe('a pressable tag folds disabled into accessibilityState', () => {
  it('announces a disabled button as disabled', () => {
    const props = commitTag(PRESSABLE_VIEW, PRESSABLE_TAG, {
      disabled: true,
    });

    expect(props.accessibilityState).toEqual({ disabled: true });
  });

  it('merges into an accessibilityState the app already set', () => {
    const props = commitTag(PRESSABLE_VIEW, PRESSABLE_TAG, {
      disabled: true,
      accessibilityState: { selected: true },
    });

    expect(props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
  });

  it('leaves accessibilityState alone when nothing is disabled', () => {
    const props = commitTag(PRESSABLE_VIEW, PRESSABLE_TAG, {});

    expect(Object.keys(props)).not.toContain('accessibilityState');
  });

  it('does not send the props only the machine reads', () => {
    const props = commitTag(PRESSABLE_VIEW, PRESSABLE_TAG, {
      disabled: true,
      cancelable: false,
      delayLongPress: 700,
      unstable_pressDelay: 50,
      pressRetentionOffset: 20,
    });

    for (const key of [
      'disabled',
      'cancelable',
      'delayLongPress',
      'unstable_pressDelay',
      'pressRetentionOffset',
    ]) {
      expect(Object.keys(props)).not.toContain(key);
    }
  });

  // CONTROL. Every case above reads a payload built for a tag carrying a behavior, and a payload
  // with no fold at all would satisfy the three `not.toContain` cases by itself. So pin that the
  // same prop on a BEHAVIORLESS tag is untouched — which is what makes the folds above attributable
  // to the behavior rather than to something the engine does for every node.
  it('folds nothing on a node with no behavior', () => {
    const props = commitTag(PRESSABLE_VIEW, 'view', {
      disabled: true,
    });

    expect(props.disabled).toBe(true);
    expect(Object.keys(props)).not.toContain('accessibilityState');
  });
});

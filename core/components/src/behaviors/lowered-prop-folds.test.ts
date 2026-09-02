// The wrapper-body prop folds, asserted on the COMMITTED payload for a LOWERED element.
//
// `tests/lowered-primitive-fold-parity.test.ts` asks whether the behavior CALLS the shared fold —
// a file-listing proxy that catches an omission cheaply and can say nothing about the result. This
// says what the device would see. Both are needed: the proxy notices a fold nobody wired, and this
// notices a fold wired wrongly.
//
// Every assertion is on the payload rather than on `node.props`, because the failure mode is
// precisely that the raw prop sits on the node looking correct while the folded one never reaches
// Fabric.
import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { registerPressableBehavior, PRESSABLE_TAG } from './pressable';
import { registerTextInputBehavior, TEXT_INPUT_TAG } from './text-input';

const fabric = installFabric();
registerPressableBehavior();
registerTextInputBehavior();

let nextRootTag = 9600;

// PRODUCTION SHAPE — the Fabric view name as the component, the intrinsic tag third. Passing the
// tag AS the component matches the behavior registry by accident and leaves every case green over
// a registration that can never fire in an app (`.claude/rules/test-harness-false-greens.md` §11).
const TEXT_INPUT_VIEW = 'RCTSinglelineTextInputView';
const PRESSABLE_VIEW = 'RCTView';
const TEST_ID = 'subject';

function commitLowered(
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

  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const candidate of nodes) {
      if (candidate.props.testID === TEST_ID) return candidate;
      const hit = walk(candidate.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const found = walk(fabric.appRoot().children);
  if (found === undefined) throw new Error('the subject never reached Fabric');
  return found.props;
}

describe('a lowered TextInput folds the W3C aliases', () => {
  it('maps inputMode / readOnly / enterKeyHint onto the native props', () => {
    const props = commitLowered(TEXT_INPUT_VIEW, TEXT_INPUT_TAG, {
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
    const props = commitLowered(TEXT_INPUT_VIEW, TEXT_INPUT_TAG, {
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
    const props = commitLowered(TEXT_INPUT_VIEW, TEXT_INPUT_TAG, {});

    // Hides the Material EditText bar; absent, every Android input grows a line under it.
    expect(props.underlineColorAndroid).toBe('transparent');
    expect(props.submitBehavior).toBe('blurAndSubmit');
  });
});

describe('a lowered Pressable folds disabled into accessibilityState', () => {
  it('announces a disabled button as disabled', () => {
    const props = commitLowered(PRESSABLE_VIEW, PRESSABLE_TAG, {
      disabled: true,
    });

    expect(props.accessibilityState).toEqual({ disabled: true });
  });

  it('merges into an accessibilityState the app already set', () => {
    const props = commitLowered(PRESSABLE_VIEW, PRESSABLE_TAG, {
      disabled: true,
      accessibilityState: { selected: true },
    });

    expect(props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
  });

  it('leaves accessibilityState alone when nothing is disabled', () => {
    const props = commitLowered(PRESSABLE_VIEW, PRESSABLE_TAG, {});

    expect(Object.keys(props)).not.toContain('accessibilityState');
  });

  it('does not send the props only the machine reads', () => {
    const props = commitLowered(PRESSABLE_VIEW, PRESSABLE_TAG, {
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
  // same prop on an UNLOWERED tag is untouched — which is what makes the folds above attributable
  // to the behavior rather than to something the engine does for every node.
  it('folds nothing on a node with no behavior', () => {
    const props = commitLowered(PRESSABLE_VIEW, 'symbiote-view', {
      disabled: true,
    });

    expect(props.disabled).toBe(true);
    expect(Object.keys(props)).not.toContain('accessibilityState');
  });
});

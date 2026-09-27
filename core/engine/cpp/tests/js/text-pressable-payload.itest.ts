// A pressable <Text>, against RN's Text.js:152-163: pressable (onPress / onLongPress /
// onStartShouldSetResponder, not disabled) with no role of its own announces itself as a link.
// Platform-invariant; the Android `accessible` half lives in `android-rules.android.itest.ts`.

import {
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

// `routeProp`, because a press listener has to take the listener path, not land in the bag.
function textPayload(
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> | undefined {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTText', true, 'text');
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return committedPayloadOf(node);
}

describe('what a pressable text sends native', () => {
  // why: Text.js:157-160 — a pressable text with no role is a link to assistive tech.
  it('gives a pressable text the link role', () => {
    expect(textPayload({ onPress: () => {} })?.accessibilityRole).toBe('link');
    expect(textPayload({ onLongPress: () => {} })?.accessibilityRole).toBe(
      'link',
    );
  });

  // why: plain text has no role; an authored role, or a disabled text, keeps RN's own answer.
  it('leaves the role alone when not pressable, disabled or already set', () => {
    expect(textPayload({})?.accessibilityRole).toBe(undefined);
    expect(
      textPayload({ onPress: () => {}, disabled: true })?.accessibilityRole,
    ).toBe(undefined);
    expect(
      textPayload({ onPress: () => {}, accessibilityRole: 'button' })
        ?.accessibilityRole,
    ).toBe('button');
  });
});

report();

// What the Angular adapter contributes to a `<text>`'s props — the FORWARDING, as of 2026-09-18.
//
// THIS FILE'S OLD SUBJECT WAS AN ANGULAR-SPECIFIC ARGUMENT, and it is worth recording why it stopped
// being one. Angular declared `ellipsizeMode` and `allowFontScaling` as real `@Input()`s rather than
// letting them pass through, because a default can only be applied by code that can SEE whether the
// caller supplied a value, and a pass-through host binding is invisible to the component. That was
// sound while the defaulting lived in the component.
//
// It does not any more. The rule reads the AUTHORED bag at payload time (`foldTextDefaults`,
// `SymbioteFabricProps.cpp`), which can tell an absent prop from an explicit `clip` without anyone
// declaring anything — so the two `@Input()`s were deleted and `TextHost` is an ordinary primitive
// host again. The defaults' own claims live in `core/engine/cpp/tests/js/committed-payload.itest.ts`,
// read off a payload a commit actually sent.
//
// So the cases here are the ones that are still Angular's: the pass-through carries an authored
// value, and a bare `<text>` with no component behind it commits the same component as one with.
// Read off `fabricProps`, not `fabric.find`: createNode never re-runs, so a prop applied through a
// lifecycle hook only shows up on the live clone.

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installRecordingFabric,
  waitUntil,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import { fabricProps, propsOf } from '@symbiote-native/engine';

import { mount, unmount } from '../render';
import { TextHost } from '../primitives';

const ROOT_TAG = 984;
const fabric = installRecordingFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committed(testID: string): IAuthoredNode | undefined {
  return fabric.find(node => node.props.testID === testID);
}

function payloadOf(testID: string): Record<string, unknown> {
  const node = committed(testID);
  if (node === undefined) throw new Error(`no committed node ${testID}`);
  return fabricProps(node.handle, propsOf(node.handle));
}

@Component({
  selector: 'symbiote-text-defaults-explicit',
  standalone: true,
  imports: [TextHost],
  template: `<text
    testID="explicit"
    ellipsizeMode="clip"
    [allowFontScaling]="false"
    >clamped</text
  >`,
})
class ExplicitHost {}

// THE UNMATCHED SPELLING, and the arm this file was missing for as long as it has existed.
//
// The case above mounts `<text>` with the component in `imports`. With no component behind it the
// tag reaches the engine alone, and for two years the two paths did different things — which is how
// a bare `<text>` shipped text that truncates with no ellipsis, device-observed on examples/svelte.
// They cannot differ any more, since neither path folds anything, and that is exactly what this
// asserts: both commit the same COMPONENT, which is what the engine's rule is keyed on.
//
// `schemas: [CUSTOM_ELEMENTS_SCHEMA]` with `TextHost` absent from `imports` is load-bearing and is
// the whole reason this needs its own component: Angular's primitive host matches the tag itself
// (`selector: 'text'`) and directive matching is resolved per TEMPLATE, so importing TextHost
// anywhere in this template would make `<text>` resolve straight back to the component and the test
// would assert the same path twice under two spellings.
@Component({
  selector: 'symbiote-text-defaults-bare',
  standalone: true,
  template: `<text testID="bare">clamped</text>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class BareTagHost {}

describe('what Angular sends a text tag', () => {
  // why: the pass-through has to carry an authored value now that no `@Input()` does. This is the
  // case that would have caught the deletion of those inputs going wrong, and it is why they could
  // be deleted at all.
  it('forwards a value the caller supplied, through the pass-through', async () => {
    mount(ROOT_TAG, ExplicitHost);
    await waitUntil(
      () => committed('explicit') !== undefined,
      'explicit Text commits',
    );

    const payload = payloadOf('explicit');
    // 'clip' is a real RN mode, not an absent value — an adapter that dropped it would leave the
    // engine defaulting a Text whose author deliberately turned the ellipsis off.
    expect(payload.ellipsizeMode).toBe('clip');
    expect(payload.allowFontScaling).toBe(false);
  });

  // why: the component is what the engine's rule is keyed on, so a tag with no Angular component
  // behind it must still commit as one. Phrased as the capability rather than as the defaults, all
  // five adapters ask the same question of themselves here.
  it('commits a bare tag under the same component as the matched one', async () => {
    mount(ROOT_TAG, BareTagHost);
    await waitUntil(
      () => committed('bare') !== undefined,
      'the bare text commits',
    );

    expect(committed('bare')?.viewName).toBe('RCTText');
  });
});

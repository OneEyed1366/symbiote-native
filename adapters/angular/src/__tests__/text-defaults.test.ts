// RN's Text.js applies two defaults unconditionally (Text.js:289 and :291):
//
//   processedProps.allowFontScaling = allowFontScaling !== false;
//   processedProps.ellipsizeMode = ellipsizeMode ?? 'tail';
//
// All five adapters declared the props and applied neither, so native fell back to `clip` — a
// clamped Text cut mid-word with no ellipsis. Device-observed on examples/svelte 2026-08-19.
//
// Angular needed the two as real @Input()s rather than the base's pass-through, because a default
// can only be applied by code that can SEE whether the caller supplied a value; a host-binding
// pass-through is invisible to the component, so writing 'tail' blindly would clobber an explicit
// `ellipsizeMode="clip"`. The last case below is that guarantee.
//
// Read off fabric.committed, not fabric.find: createNode never re-runs, so a prop applied through
// a lifecycle hook only shows up on the live clone.

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

// THE PAYLOAD, not the ops bag. `seedTextDefaults` used to write both keys as real `setProp` calls,
// which made `.props` the right place to read; the rule moved into the payload builder
// (`applyTextDefaults`, `core/engine/src/fabric-props.ts`) because writing them cost a crossing every
// time the app authored the same value — 6 000 per 1 000-row create, measured with
// `writesOfUnchanged`. The recording host's `props` is "as the ops named it", so it can no longer see
// them; `fabricProps` off the engine node is what native actually receives.
//
// The `@Input()` guarantee this file exists for is UNCHANGED and is still worth asserting here: a
// pass-through host binding cannot tell an absent prop from an authored one, so Angular has to
// declare both as real inputs for the "never overwrites the caller" case below to hold.
function committed(testID: string): IAuthoredNode | undefined {
  return fabric.find(node => node.props.testID === testID);
}

function payloadOf(testID: string): Record<string, unknown> {
  const node = committed(testID);
  if (node === undefined) throw new Error(`no committed node ${testID}`);
  return fabricProps(node.handle, propsOf(node.handle));
}

@Component({
  selector: 'symbiote-text-defaults-plain',
  standalone: true,
  imports: [TextHost],
  template: `<text testID="plain">clamped</text>`,
})
class PlainHost {}

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
// Everything above mounts `<text>` with the component in `imports` — the path that already folds
// the defaults. With no component behind it the tag reaches the engine alone, and `resolveTextProps`
// lives in `../primitives`. So the two tests above were green while a bare `<text>` shipped text
// that truncates with no ellipsis, device-observed once already on examples/svelte.
//
// `schemas: [CUSTOM_ELEMENTS_SCHEMA]` with `TextHost` absent from `imports` is load-bearing and is
// the whole reason this needs its own component: Angular's primitive host matches the tag itself
// (`selector: 'text'`) and directive matching is resolved per TEMPLATE, so importing TextHost
// anywhere in this template would make `<text>` resolve straight back to the component and the test
// would assert the same path twice under two spellings.
//
// The other four adapters satisfy this in two different ways — Svelte folds from the spec's
// `defaults`, Vue and Solid seed in the renderer. That is why the assertion is on the COMMITTED
// PAYLOAD: phrase the oracle as the capability — does a bare `<text>` commit these two keys — and
// all five become comparable.
@Component({
  selector: 'symbiote-text-defaults-bare',
  standalone: true,
  template: `<text testID="bare">clamped</text>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class BareTagHost {}

describe('Angular Text RN defaults', () => {
  it("defaults ellipsizeMode to 'tail' and allowFontScaling to true", async () => {
    mount(ROOT_TAG, PlainHost);
    // Zoneless CD commits on its own schedule; wait for the node, not for a tick count.
    await waitUntil(
      () => committed('plain') !== undefined,
      'plain Text commits',
    );

    const payload = payloadOf('plain');
    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });

  it('never overwrites a value the caller supplied', async () => {
    mount(ROOT_TAG, ExplicitHost);
    await waitUntil(
      () => committed('explicit') !== undefined,
      'explicit Text commits',
    );

    const payload = payloadOf('explicit');
    // 'clip' is a real RN mode, not an absent value — re-defaulting it to 'tail' would be a
    // silent behaviour change for anyone who deliberately turned the ellipsis off.
    expect(payload.ellipsizeMode).toBe('clip');
    expect(payload.allowFontScaling).toBe(false);
  });

  it('applies the same defaults to a text tag with no component behind it', async () => {
    mount(ROOT_TAG, BareTagHost);
    await waitUntil(
      () => committed('bare') !== undefined,
      'the bare text commits',
    );

    const payload = payloadOf('bare');
    // Six of these — two keys on each of a benchmark row's three Text nodes — are the entire
    // prop-key gap that made Angular's column incomparable to every other adapter's.
    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });
});

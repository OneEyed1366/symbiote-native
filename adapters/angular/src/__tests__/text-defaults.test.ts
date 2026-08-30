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
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installFabric,
  waitUntil,
  type IFakeNode,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { TextHost } from '../primitives';

const ROOT_TAG = 984;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committed(testID: string): IFakeNode | undefined {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(fabric.committed);
}

@Component({
  selector: 'symbiote-text-defaults-plain',
  standalone: true,
  imports: [TextHost],
  template: `<Text testID="plain">clamped</Text>`,
})
class PlainHost {}

@Component({
  selector: 'symbiote-text-defaults-explicit',
  standalone: true,
  imports: [TextHost],
  template: `<Text
    testID="explicit"
    ellipsizeMode="clip"
    [allowFontScaling]="false"
    >clamped</Text
  >`,
})
class ExplicitHost {}

describe('Angular Text RN defaults', () => {
  it("defaults ellipsizeMode to 'tail' and allowFontScaling to true", async () => {
    mount(ROOT_TAG, PlainHost);
    // Zoneless CD commits on its own schedule; wait for the node, not for a tick count.
    await waitUntil(
      () => committed('plain') !== undefined,
      'plain Text commits',
    );

    const node = committed('plain');
    expect(node).toBeDefined();
    expect(node?.props.ellipsizeMode).toBe('tail');
    expect(node?.props.allowFontScaling).toBe(true);
  });

  it('never overwrites a value the caller supplied', async () => {
    mount(ROOT_TAG, ExplicitHost);
    await waitUntil(
      () => committed('explicit') !== undefined,
      'explicit Text commits',
    );

    const node = committed('explicit');
    expect(node).toBeDefined();
    // 'clip' is a real RN mode, not an absent value — re-defaulting it to 'tail' would be a
    // silent behaviour change for anyone who deliberately turned the ellipsis off.
    expect(node?.props.ellipsizeMode).toBe('clip');
    expect(node?.props.allowFontScaling).toBe(false);
  });
});

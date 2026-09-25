// This file pins the diff `SymbioteHostPropsDirective` uses over a composed component's flat,
// mostly-unset bag: an unset key costs nothing on mount, a key CHANGING to `undefined` still
// clears the prop, and one VANISHING from the bag clears it too — proven at the renderer.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { SymbioteRenderer } from '../renderer';
import { ViewHost as View, SymbioteHostPropsDirective } from '../primitives';

const ROOT_TAG = 993;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Every (key, value) the renderer was handed, in order.
function probeSetProperty(): {
  writes: () => Array<{ key: string; value: unknown }>;
  clear: () => void;
  restore: () => void;
} {
  const original = SymbioteRenderer.prototype.setProperty;
  let seen: Array<{ key: string; value: unknown }> = [];
  SymbioteRenderer.prototype.setProperty = function patched(
    node: unknown,
    name: string,
    value: unknown,
  ): void {
    seen.push({ key: name, value });
    original.call(this, node, name, value);
  };
  return {
    writes: () => seen,
    clear: (): void => {
      seen = [];
    },
    restore: (): void => {
      SymbioteRenderer.prototype.setProperty = original;
    },
  };
}

let mounted: DiffHost | undefined;

@Component({
  selector: 'diff-host',
  standalone: true,
  imports: [View, SymbioteHostPropsDirective],
  template: `<view [symbioteHostProps]="bag"></view>`,
})
class DiffHost {
  readonly accessibilityLabel = signal<string | undefined>(undefined);
  // Drops out of the bag entirely when false — the shape a folded accessibility set produces.
  // Deliberately NOT `role`/`aria-*`: those now trip the engine's aria fold
  // (`core/engine/src/accessibility-props.ts`), which blanks the alias and writes
  // `accessibilityRole` instead — a different mechanism from the one this test pins. This key
  // must stay outside `isAriaAliasKey` so the vanish/reappear behaviour under test is the
  // directive's own diffing, not the fold's.
  readonly includesHint = signal(false);

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mounted = this;
  }

  // A getter, so every change-detection pass hands the directive a fresh object.
  get bag(): Record<string, unknown> {
    const bag: Record<string, unknown> = {
      testID: 'diff-probe',
      nativeID: undefined,
      accessibilityLabel: this.accessibilityLabel(),
    };
    if (this.includesHint()) bag.accessibilityHint = 'hint';
    return bag;
  }
}

function host(): DiffHost {
  if (mounted === undefined)
    throw new Error('host component was never constructed');
  return mounted;
}

function committedProbe() {
  const found = live.findLive(
    live.appRoot(),
    node => node.payload.testID === 'diff-probe',
  );
  if (found === undefined) throw new Error('probe node was never committed');
  return found;
}

let probe: ReturnType<typeof probeSetProperty>;

beforeEach(() => {
  fabric.reset();
  probe = probeSetProperty();
});
afterEach(() => {
  unmount(ROOT_TAG);
  probe.restore();
});

describe('SymbioteHostPropsDirective per-key diff', () => {
  // why: THE number. A fresh node has no props to delete, so every `undefined` in a fixed-shape
  // bag is a write that cannot change anything — and it is most of the bag.
  it('does not write a key the bag leaves unset on mount', async () => {
    mount(ROOT_TAG, DiffHost);
    await flush();

    const keys = probe.writes().map(write => write.key);
    expect(keys, 'a set key must still be written').toContain('testID');
    expect(
      keys.filter(key => key === 'nativeID' || key === 'accessibilityHint'),
      'an unset key has nothing to clear on a fresh node',
    ).toEqual([]);
  });

  // why: the correctness half. Skipping `undefined` on mount must not turn into skipping it
  // always — a prop that goes back to unset has to be removed from the node.
  it('writes a key that CHANGES to undefined, so the prop is cleared', async () => {
    mount(ROOT_TAG, DiffHost);
    await flush();

    host().accessibilityLabel.set('labelled');
    host().includesHint.set(true);
    await flush();
    expect(
      committedProbe().payload.accessibilityLabel,
      'the label must reach the node first',
    ).toBe('labelled');

    probe.clear();
    host().accessibilityLabel.set(undefined);
    await flush();

    expect(
      probe.writes().filter(write => write.key === 'accessibilityLabel'),
      'a value going back to unset must be written so the engine deletes it',
    ).toEqual([{ key: 'accessibilityLabel', value: undefined }]);
    // The op stream spells a removed key with `NO_VALUE`, which the recording obeys by deleting
    // it — the key's ABSENCE is proof a clearing op was sent (`.docs/mirror-elimination.md`,
    // "RESOLVED: the `onLayout === null` decision").
    expect(Object.hasOwn(committedProbe().payload, 'accessibilityLabel')).toBe(
      false,
    );
  });

  // why: the key SET is not fixed across pushes (resolveAccessibilityProps returns two different
  // shapes), and a vanished key left unwritten strands its last value on the native view.
  it('clears a key that vanishes from the bag', async () => {
    mount(ROOT_TAG, DiffHost);
    await flush();

    host().includesHint.set(true);
    await flush();
    expect(
      committedProbe().payload.accessibilityHint,
      'accessibilityHint must reach the node first',
    ).toBe('hint');

    probe.clear();
    host().includesHint.set(false);
    await flush();

    expect(
      probe.writes().filter(write => write.key === 'accessibilityHint'),
      'a key that disappears from the bag must be cleared explicitly',
    ).toEqual([{ key: 'accessibilityHint', value: undefined }]);
    expect(Object.hasOwn(committedProbe().payload, 'accessibilityHint')).toBe(
      false,
    );
  });
});

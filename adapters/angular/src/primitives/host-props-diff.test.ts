// `SymbioteHostPropsDirective` pushes a whole flat bag, and a composed component's bag is a
// FIXED-SHAPE literal: Pressable's carries ~48 keys, of which any one instance sets a handful.
// Writing every key of every bag therefore spent most of its work deleting keys the node never
// had — measured 2026-08-20 on a headless 1000-row create of the benchmark row: 104 000 engine
// setProp calls, 90 000 of them carrying `undefined`, against 12 000 for the identical screen in
// Solid, with byte-identical Fabric output on both sides.
//
// This file pins the three halves of the diff that replaced it: an unset key costs nothing on
// mount, a key that CHANGES to `undefined` still clears the prop, and a key that VANISHES from
// the bag clears it too (`resolveAccessibilityProps` really does return two different key sets).
// The observable is the renderer, one level below the directive, so it proves what the engine was
// handed rather than what a private field holds.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { SymbioteRenderer } from '../renderer';
import { ViewHost as View, SymbioteHostPropsDirective } from '../primitives';

const ROOT_TAG = 993;

const fabric = installFabric();

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
  template: `<View [symbioteHostProps]="bag"></View>`,
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

function committedProbe(): IFakeNode {
  const found = fabric.committed
    .flatMap(node => node.children)
    .find(node => node.props.testID === 'diff-probe');
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
      committedProbe().props.accessibilityLabel,
      'the label must reach the node first',
    ).toBe('labelled');

    probe.clear();
    host().accessibilityLabel.set(undefined);
    await flush();

    expect(
      probe.writes().filter(write => write.key === 'accessibilityLabel'),
      'a value going back to unset must be written so the engine deletes it',
    ).toEqual([{ key: 'accessibilityLabel', value: undefined }]);
    expect(committedProbe().props.accessibilityLabel).toBeNull();
  });

  // why: the key SET is not fixed across pushes (resolveAccessibilityProps returns two different
  // shapes), and a vanished key left unwritten strands its last value on the native view.
  it('clears a key that vanishes from the bag', async () => {
    mount(ROOT_TAG, DiffHost);
    await flush();

    host().includesHint.set(true);
    await flush();
    expect(
      committedProbe().props.accessibilityHint,
      'accessibilityHint must reach the node first',
    ).toBe('hint');

    probe.clear();
    host().includesHint.set(false);
    await flush();

    expect(
      probe.writes().filter(write => write.key === 'accessibilityHint'),
      'a key that disappears from the bag must be cleared explicitly',
    ).toEqual([{ key: 'accessibilityHint', value: undefined }]);
    expect(committedProbe().props.accessibilityHint).toBeNull();
  });
});

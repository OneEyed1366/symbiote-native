// `switch` as a TAG, measured through Angular's own renderer. The state machine itself
// (lastNativeReport, the deferred snap-back check, the color/disabled prop fold) lives on the
// engine node (`core/components/src/behaviors/switch.ts`) and is fully unit-tested there. The
// `[(value)]` two-way bridge (the tag/event wiring itself) is already proven by
// `renderer/lowered-two-way-value.test.ts` — this file covers the two things that leaves open:
// the color/disabled prop fold reaching the tag through Angular's own template binding, and the
// snap-back command firing/staying silent through Angular's own change detection — the same
// bridge-smoke shape React's, Vue's and Solid's Switch suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws.
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what runs the machine. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_985;
const MAX_SETTLE_TICKS = 20;
const SWITCH_VIEW = 'Switch';
const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await tick();
    const current = fabric.counts.completeRoot;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error('the tree never settled');
}

function switchNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  if (node === undefined) throw new Error(`no ${SWITCH_VIEW} was created`);
  return node;
}

// The LIVE tree, by testID — never `fabric.find()`, which reads the pre-clone `created` set and
// can hand back a node's mount-time props after a later update (`test-harness-false-greens.md`).
function committedProps(testID: string): Record<string, unknown> | undefined {
  const walk = (
    nodes: readonly IFakeNode[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

function commandsNamed(
  name: string,
): ReadonlyArray<{ commandName: string; args: readonly unknown[] }> {
  return fabric.commands.filter(entry => entry.commandName === name);
}

let fixtureId = 0;

async function mountTemplate(
  template: string,
  bindings: Record<string, unknown> = {},
): Promise<void> {
  fixtureId += 1;
  @Component({
    // Unique per mount: a repeated selector makes Angular log an NG0912 component-id collision.
    selector: `switch-tag-fixture-${fixtureId}`,
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template,
  })
  class Fixture {
    [key: string]: unknown;
    constructor() {
      Object.assign(this, bindings);
    }
  }

  mount(ROOT_TAG, Fixture satisfies Type<unknown>);
  await flushUntilSettled();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular: `switch` as a tag', () => {
  it('maps color/disabled props to the native iOS prop names', async () => {
    await mountTemplate(
      `<switch [value]="true" [disabled]="true" [trackColor]="trackColor" [thumbColor]="'#f5dd4b'"></switch>`,
      { trackColor: { false: '#767577', true: '#81b0ff' } },
    );

    expect(switchNode().props).toMatchObject({
      value: true,
      disabled: true,
      onTintColor: '#81b0ff',
      tintColor: '#767577',
      thumbTintColor: '#f5dd4b',
    });
  });

  it('snaps native back via a setValue command when a no-op handler rejects the toggle', async () => {
    await mountTemplate(
      `<switch [value]="false" [onValueChange]="onValueChange"></switch>`,
      {
        onValueChange: () => {},
      },
    );

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();
    await tick();

    const setValue = commandsNamed('setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toHaveLength(
      1,
    );
    expect(setValue[0]!.args[0]).toBe(false);
  });

  // why: `renderer/lowered-two-way-value.test.ts` already proves `[(value)]` writes the accepted
  // toggle back into the parent field — this proves the OTHER half, that the accepted value never
  // triggers a spurious snap-back once it round-trips through Angular's own change detection.
  it('issues no snap-back command once [(value)] accepts the toggle', async () => {
    await mountTemplate(`<switch testID="subject" [(value)]="on"></switch>`, {
      on: false,
    });

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();
    await tick();

    expect(commandsNamed('setValue')).toHaveLength(0);
    expect(committedProps('subject')).toMatchObject({ value: true });
  });

  // why: `SwitchElement extends ValueChangeElement`, the SAME base `<text-input>` uses. RN's own
  // controlled pattern has no such collision (`value` is just a controlled prop, `onChange` always
  // fires) — so RN parity means BOTH must fire when both are bound, not one silently winning.
  // Was a confirmed bug (fixed in `renderer/index.ts`'s `listen()`): `[(value)]`'s `routeProp`
  // install used to REPLACE the `onValueChange` prop outright, dropping whatever `ngOnChanges` had
  // already written from an explicit `[onValueChange]` binding.
  it('calls both the explicit onValueChange and [(value)] when both are bound', async () => {
    const onValueChange = vi.fn();
    await mountTemplate(
      `<switch testID="subject" [(value)]="on" [onValueChange]="onValueChange"></switch>`,
      { on: false, onValueChange },
    );

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();
    await tick();

    // `onValueChange` is a plain function-prop fold (`behaviors/switch.ts`'s `callValueChange`),
    // called with the raw change event carrying `.value` — not a bare boolean, same contract as
    // the non-two-way path.
    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: true }),
    );
    expect(committedProps('subject')).toMatchObject({ value: true });
  });
});

// `input-accessory-view` as a TAG, measured through Angular's own renderer. The fold itself
// (nativeID/backgroundColor/style forwarding, passthrough merge, no structural children of its
// own) is framework-agnostic and unit-tested in core
// (`core/components/src/behaviors/input-accessory-view.test.ts`); this file proves the ANGULAR
// WIRING: a template `<input-accessory-view>` reaches a real Fabric node, Angular nests its own
// children under it, and the nativeID <-> inputAccessoryViewID docking pair (a shared-string-id
// RN convention, no runtime linking code) survives Angular's own template binding — the same
// bridge-smoke shape React's and Solid's InputAccessoryView suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: every prop is optional and every path resolves to some descriptor —
// nothing here rejects an input (React's and Solid's twins reach the same conclusion).
//
// The fixture imports `SYMBIOTE_ELEMENTS` and declares no schema, which is the shape an app
// writes. This file runs JIT, so it answers what the renderer DOES, not what the compiler
// accepts (`.claude/rules/test-harness-false-greens.md` §21).
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_979;
const MAX_SETTLE_TICKS = 20;
const ACCESSORY_VIEW = 'RCTInputAccessoryView';
const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eeeeee';
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

function accessoryNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === ACCESSORY_VIEW);
  if (node === undefined) throw new Error(`no ${ACCESSORY_VIEW} was created`);
  return node;
}

let fixtureId = 0;

async function mountTemplate(template: string): Promise<void> {
  fixtureId += 1;
  @Component({
    // Unique per mount: a repeated selector makes Angular log an NG0912 component-id collision.
    selector: `input-accessory-view-tag-fixture-${fixtureId}`,
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template,
  })
  class Fixture {}

  mount(ROOT_TAG, Fixture satisfies Type<unknown>);
  await flushUntilSettled();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular: `input-accessory-view` as a tag', () => {
  it('mounts a real RCTInputAccessoryView carrying nativeID, backgroundColor, and flattened style', async () => {
    await mountTemplate(
      `<input-accessory-view nativeID="${NATIVE_ID}" backgroundColor="${BACKGROUND_COLOR}" [style]="{ flex: 1 }"></input-accessory-view>`,
    );

    const props = accessoryNode().props;
    expect(props.nativeID).toBe(NATIVE_ID);
    expect(props.backgroundColor).toBe(BACKGROUND_COLOR);
    expect(props.flex).toBe(1);
  });

  it('nests Angular-rendered children directly under the host', async () => {
    await mountTemplate(
      `<input-accessory-view nativeID="${NATIVE_ID}"><text>Done</text></input-accessory-view>`,
    );

    const children = accessoryNode().children;
    expect(children).toHaveLength(1);
    expect(children[0].viewName).toBe('RCTText');
  });

  it('keeps the nativeID <-> inputAccessoryViewID docking pair intact across both', async () => {
    await mountTemplate(
      `<view><text-input inputAccessoryViewID="${NATIVE_ID}"></text-input><input-accessory-view nativeID="${NATIVE_ID}"></input-accessory-view></view>`,
    );

    const input = fabric.find(n => n.viewName === 'RCTSinglelineTextInputView');
    expect(input, 'a TextInput was created').toBeDefined();
    expect(input!.props.inputAccessoryViewID).toBe(
      accessoryNode().props.nativeID,
    );
  });
});

// The receiving half of the lowering transform's `[style]` -> `[symbioteStyle]` rename.
//
// Angular routes a `style` binding to its own CSS styling engine, which decomposes the value key
// by key and cannot represent an RN StyleProp — an ARRAY makes `applyStyling` use each element as
// a style KEY and throw inside change detection. A component `@Input()` shadows that instruction;
// a lowered element has none, so the transform emits the binding under a different name and the
// renderer folds it back here. Device-diagnosed 2026-09-02 on ImageBackground.
//
// The array case is the one that used to crash, so it is the one asserted.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';

const ROOT_TAG = 934;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'style-alias-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-view
    testID="probe"
    [symbioteStyle]="style"
  ></symbiote-view>`,
})
class StyleAliasHost {
  readonly style = [{ opacity: 0.5 }, { width: 12 }];
}

interface ICommitted {
  props: Record<string, unknown>;
  children: ICommitted[];
}

// Finds the NODE first and reads its style second: returning `props.style` from the walk makes
// "found, but unstyled" indistinguishable from "not found", and both are failures worth telling
// apart.
function probeNode(): ICommitted {
  const visit = (node: ICommitted): ICommitted | undefined => {
    if (node.props.testID === 'probe') return node;
    for (const child of node.children) {
      const hit = visit(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const hit = visit(root as unknown as ICommitted);
    if (hit !== undefined) return hit;
  }
  throw new Error('no committed node carrying testID="probe"');
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('symbioteStyle on a lowered element', () => {
  it('commits as the node style, array and all', async () => {
    mount(ROOT_TAG, StyleAliasHost);
    await tick();

    // Style declarations are hoisted into the payload itself, so there is no `style` key to read
    // — the two array members landing flattened IS the proof the binding was routed as a style.
    expect(probeNode().props).toEqual({
      testID: 'probe',
      opacity: 0.5,
      width: 12,
    });
  });
});

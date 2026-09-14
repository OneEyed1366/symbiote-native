// `[style]` carrying an RN StyleProp ARRAY, which is the shape Angular's own styling engine cannot
// represent: it decomposes the value key by key, so `applyStyling` uses each array element as a
// style KEY and throws inside change detection. Device-diagnosed 2026-09-02 on ImageBackground.
//
// What makes it work is that `SymbioteElement` DECLARES `style` as an input, so a matched element
// claims the binding at compile time and it never reaches that engine — it arrives at
// `Renderer2.setProperty` like any other prop. This file mounts through the real directive and
// asserts the array survives; `bare-intrinsic-tag.test.ts` holds the unmatched arm that throws.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import { ViewElement } from '../elements';
import { mount, unmount } from '../render';

const ROOT_TAG = 934;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'style-input-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ViewElement],
  template: `<view testID="probe" [style]="style"></view>`,
})
class StyleInputHost {
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

describe('[style] on a matched element', () => {
  it('commits as the node style, array and all', async () => {
    mount(ROOT_TAG, StyleInputHost);
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

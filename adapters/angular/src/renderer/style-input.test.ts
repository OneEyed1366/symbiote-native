// The two style bindings a tag takes, each reaching the node whole.
//
// `[style]` is Angular's styling binding: an OBJECT decomposes into per-key `Renderer2.setStyle`
// calls, merged back into one style. An RN StyleProp ARRAY throws there (`applyStyling` reads each
// member as a style key), so it travels as `[styleProp]`, a plain property routed to `style`.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

import { SYMBIOTE_ELEMENTS } from '../elements';
import { mount, unmount } from '../render';

const ROOT_TAG = 934;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'style-prop-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SYMBIOTE_ELEMENTS],
  template: `<view testID="probe" [styleProp]="style"></view>`,
})
class StylePropHost {
  readonly style = [{ opacity: 0.5 }, { width: 12 }];
}

@Component({
  selector: 'style-object-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SYMBIOTE_ELEMENTS],
  template: `<view testID="probe" [style]="style"></view>`,
})
class StyleObjectHost {
  readonly style = { opacity: 0.5, width: 12 };
}

// Finds the NODE first and reads its style second: returning the style from the walk makes
// "found, but unstyled" indistinguishable from "not found", and both are failures worth telling
// apart.
function probeNode(): ILiveNode {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === 'probe',
  );
  if (hit === undefined)
    throw new Error('no committed node carrying testID="probe"');
  return hit;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('a style binding on a tag', () => {
  // why: an RN StyleProp array is what an app merges styles with; it must land flattened.
  it('commits a [styleProp] array as the node style', async () => {
    mount(ROOT_TAG, StylePropHost);
    await tick();

    // Style declarations are hoisted into the payload itself, so there is no `style` key to read
    // — the two array members landing flattened IS the proof the binding was routed as a style.
    expect(probeNode().payload).toEqual({
      testID: 'probe',
      opacity: 0.5,
      width: 12,
    });
  });

  // why: `[style]` with an object is the plain Angular spelling and must keep working unclaimed.
  it('commits a [style] object as the node style', async () => {
    mount(ROOT_TAG, StyleObjectHost);
    await tick();

    expect(probeNode().payload).toEqual({
      testID: 'probe',
      opacity: 0.5,
      width: 12,
    });
  });
});

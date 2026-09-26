// The TAG twin of `responder-change-detection.test.ts`, guarding the same property on the
// COMPONENT path: a flat-bag `onX` prop is a plain function the engine calls, telling Angular
// nothing — a state mutation inside it dirties no view. ORACLE: the rendered text, not the field.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childrenOf, propsOf } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import '../register';
import { mount, unmount } from '../render';
import { SYMBIOTE_ELEMENTS } from '../elements';

const ROOT_TAG = 9482;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'tag-prop-cd-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  // Plain fields, not signals — the shape the canary writes, and the one that depends entirely on
  // something marking the view dirty.
  template: `
    <view testID="probe" [onLayout]="onLayout"></view>
    <text testID="readout">{{ layouts }}</text>
  `,
})
class TagPropCdHost {
  layouts = 0;
  onLayout = (): void => {
    this.layouts += 1;
  };
}

// The recording host mutates a node's props IN PLACE (no clone-on-write), so `fabric.find`
// reflects a mutation made after mount just as well as one made at creation.
function readout(): string | undefined {
  const node = fabric.find(n => n.props.testID === 'readout');
  if (node === undefined) return undefined;
  const [rawText] = childrenOf(node.handle);
  if (rawText === undefined) return undefined;
  const text = propsOf(rawText).text;
  return typeof text === 'string' ? text : undefined;
}

// The stable event target: identity survives clone-on-write.
function handle(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

const layout = { layout: { x: 0, y: 0, width: 10, height: 10 } };

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('a flat-bag onX prop repaints the view that binds its result', () => {
  // Driven THREE times, like the component-path twin: a fix that arms its refresh once would pass
  // a single-fire assertion and stop repainting on the second gesture phase.
  it('re-renders after every invocation, not just the first', async () => {
    mount(ROOT_TAG, TagPropCdHost);
    await tick();
    expect(readout()).toBe('0');

    for (const expected of ['1', '2', '3']) {
      fabric.fireEvent(handle('probe'), 'topLayout', layout);
      await tick();
      await tick();
      expect(readout()).toBe(expected);
    }
  });
});

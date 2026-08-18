// InputAccessoryView's host-node assembly (nativeID/backgroundColor/style forwarding) lives
// framework-agnostic in @symbiote-native/components/renderInputAccessoryView, shared verbatim
// with React/Vue — this file does not re-derive that. It renders directly onto its own template
// tag ([symbioteHostProps], see index.ts), NOT through DescriptorOutlet, so — unlike
// ActivityIndicator/FlatList/ImageBackground/Image, which are each their own
// ANCHOR_HOST_COMPONENTS entry two levels above their real committed node — a class= here
// resolves onto the SAME node the descriptor's props land on, one level down. What is
// Angular-specific and exercised here: the anchor `class=` merge order (mirrors
// pressable.test.ts's "resolves a class=" case).
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { InputAccessoryView } from './index';

const ROOT_TAG = 913;
const fabric = installFabric();

@Component({
  selector: 'symbiote-iav-host',
  standalone: true,
  imports: [InputAccessoryView],
  template: `
    <InputAccessoryView [testID]="'iav'" class="toolbar">
      <symbiote-text>Hello</symbiote-text>
    </InputAccessoryView>
  `,
})
class InputAccessoryViewHostFixture {}

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

// why: contract-accurate group name — nothing here throws; the descriptor bridge and the class
// merge both resolve to a value, never a rejection.
describe('InputAccessoryView (no throwing path — see file header)', () => {
  it('resolves a class= on the InputAccessoryView use site onto the real committed view, not the anchor', async () => {
    registerRules([
      {
        tokens: ['toolbar'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'orange' },
      },
    ]);

    mount(ROOT_TAG, InputAccessoryViewHostFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'iav');
    expect(node?.props.backgroundColor).toBe('orange');
  });
});

// SectionList's removeClippedSubviews, against RN's SectionList.js: every prop reaches the inner
// ScrollView. Angular relays input-by-input through VirtualizedSectionList, so a missing @Input
// at either layer drops it silently.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';
import type { ISection } from '@symbiote-native/components';

import { mount, unmount } from '../../render';
// Through the barrel, like section-list-get-item-layout.test.ts: direct imports hit a cycle.
import { SectionList, VSectionItemDirective } from '../../components';

const ROOT_TAG = 909;
const fabric = installRecordingFabric();

const sections: ISection<string>[] = [{ title: 'A', data: ['a0', 'a1'] }];

@Component({
  selector: 'symbiote-section-clip-host',
  standalone: true,
  imports: [SectionList, VSectionItemDirective],
  template: `
    <SectionList [sections]="sections" [removeClippedSubviews]="true">
      <ng-template vSectionItem let-item
        ><text>{{ item }}</text></ng-template
      >
    </SectionList>
  `,
})
class SectionClipHost {
  sections = sections;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const settle = async (): Promise<void> => {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};

describe('Angular SectionList removeClippedSubviews (Positive — no throwing path)', () => {
  // why: an authored value must reach the ScrollView through both relay layers.
  it('forwards an authored value to the scroll view', async () => {
    mount(ROOT_TAG, SectionClipHost);
    await settle();
    const node = fabric
      .findAll(candidate => candidate.viewName === 'RCTScrollView')
      .at(-1);
    expect(node, 'inner list committed a scroll view').toBeDefined();
    if (node === undefined) return;
    expect(payloadOf(node.handle).removeClippedSubviews).toBe(true);
  });
});

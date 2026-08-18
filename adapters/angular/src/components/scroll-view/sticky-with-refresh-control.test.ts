// Angular is the only adapter where RefreshControl is a projected CHILD of ScrollView. React puts
// it in the `refreshControl` PROP (adapters/react/.../virtualized-list: `scrollProps.refreshControl
// = createElement(RefreshControl, …)`), so it can never occupy a child position there. Angular's
// sticky, meanwhile, is applied POSITIONALLY over the projection controller's records.
//
// Those two facts together are the hazard this file pins down: if the projected RefreshControl
// counted as a child, every stickyHeaderIndices entry would address the child one position too
// early, and `buildListPlan.stickyChildPositions` — shared code that knows nothing about it —
// would be silently wrong on Angular alone.
//
// The existing scroll-view-projection tests cover sticky auto-wrapping and RefreshControl
// projection SEPARATELY; the interaction is what was unproven, and the interaction is where an
// off-by-one would live.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { RefreshControl, ScrollView } from '../../components';

const ROOT_TAG = 987;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

class StickyWithRefreshApp {
  readonly refreshing = signal(false);
  refresh = (): void => {
    this.refreshing.set(false);
  };
}
Component({
  selector: 'symbiote-sticky-with-refresh-test',
  standalone: true,
  imports: [ScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // stickyHeaderIndices addresses CONTENT children only. The RefreshControl is projected first in
  // source order, exactly as VirtualizedList's template emits it, so index 1 must still resolve to
  // `sticky` and not to `before`.
  template: `
    <ScrollView [stickyHeaderIndices]="[1]">
      <RefreshControl [refreshing]="refreshing()" (refresh)="refresh()" />
      <symbiote-view testID="before"></symbiote-view>
      <symbiote-view testID="sticky"></symbiote-view>
      <symbiote-view testID="after"></symbiote-view>
    </ScrollView>
  `,
})(StickyWithRefreshApp);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// A wrapped child sits inside a real Fabric view carrying collapsable:false + onLayout — the
// built-in sticky wrapper the projection controller installs. The viewName check is load-bearing:
// RCTScrollContentView carries the same two props and holds every child, so without it this
// matches the content view for ANY testID and the negative assertions below pass vacuously.
function stickyWrapperAround(testID: string): IFakeNode | undefined {
  return fabric.find(
    node =>
      node.viewName === 'RCTView' &&
      node.props.collapsable === false &&
      node.props.onLayout === true &&
      node.children.some(child => child.props.testID === testID),
  );
}

// No Negative group: there is no invalid input to reject here, only a positional outcome to prove.
describe('Angular sticky indices ignore the projected RefreshControl', () => {
  // why: the RefreshControl is projected ahead of the content children, so counting it would shift
  // every sticky index by one and pin the wrong child — the failure mode that is invisible until
  // someone scrolls a list that also has pull-to-refresh.
  it('pins the child at the content index, not one position earlier', async () => {
    mount(ROOT_TAG, StickyWithRefreshApp);
    await tick();

    expect(stickyWrapperAround('sticky')?.props).toMatchObject({
      collapsable: false,
      onLayout: true,
    });
    expect(stickyWrapperAround('before')).toBeUndefined();
    expect(stickyWrapperAround('after')).toBeUndefined();
  });
});

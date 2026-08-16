// ScrollView on iOS. The RefreshControl is a CHILD of the scroll view, rendered
// as a SIBLING BEFORE the content container (RN ScrollView.js: {refreshControl}{contentContainer}).
// The developer composes it as a projected child of <ScrollView>; this template selects it into the
// sibling slot before the scroll-content. Also the base (index.ts re-exports it) for headless /
// web. Metro picks this on an iOS host; no Platform.OS read. Mirrors the React/Vue iOS binding.
//
// UNLIKE Android, iOS has only ONE host intrinsic pair regardless of axis (both horizontal and
// vertical map to RCTScrollView / RCTScrollContentView) — `shared.ts`'s `scrollProps` already
// forwards `horizontal` as a plain prop ("iOS needs `horizontal` to flip RCTScrollView's axis").
// So, unlike `index.android.ts`, this file does NOT branch the host tag on `isHorizontal` — doing
// so anyway (mirroring Android's shape for symmetry) used to declare `<ng-content>` once per
// `@if`/`@else` branch, which trips a documented Angular limitation: content projected into the
// FIRST (`@if`) branch never receives Angular's native catch-up placement, only the SECOND
// (`@else`) branch does (angular/angular#53310, #54840 — Angular's own docs: "You should not
// conditionally include <ng-content> with @if, @for, or @switch"). Symptom here was axis-specific:
// a horizontal FlatList's cells landed outside the ScrollView entirely. Fix: single unconditional
// `<ng-content>` call site.

import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component } from '@angular/core';
import {
  RefreshControlHost,
  ScrollContentView,
  ScrollViewHost,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
} from '../../primitives';
import { ScrollViewBase, ScrollViewProjectionDirective, SCROLL_VIEW_INPUTS } from './shared';
export type { IAngularScrollViewProps, IScrollViewHandle } from './shared';

// The symbiote-* host elements are imported as standalone components; the props directive is
// applied as a template directive and the projection directive manages sticky-header wrapping.
@Component({
  selector: 'ScrollView',
  standalone: true,
  hostDirectives: [{ directive: SymbioteStyleInputDirective, inputs: ['style'] }],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    ScrollViewHost,
    ScrollContentView,
    RefreshControlHost,
    SymbioteHostPropsDirective,
    ScrollViewProjectionDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  inputs: SCROLL_VIEW_INPUTS,
  template: `
    <symbiote-scroll-view #host="symbioteHost" [symbioteHostProps]="scrollProps()">
      @if (hasProjectedRefreshControl) {
        <symbiote-refresh-control
          #refreshHost="symbioteHost"
          [symbioteHostProps]="iosRefreshControlProps"
          (refresh)="handleProjectedRefresh(refreshHost.node)"
        ></symbiote-refresh-control>
      }
      <symbiote-scroll-content
        [symbioteHostProps]="contentProps()"
        [symbioteScrollViewProjection]="projectionController"
      >
        <ng-content></ng-content>
      </symbiote-scroll-content>
    </symbiote-scroll-view>
  `,
})
// Behavior lives entirely in ScrollViewBase; this class exists for the decorator + iOS template.
// The anchor-style merge that used to be a `scrollProps` override here moved into the base's
// `scrollProps` computed - a subclass getter cannot override a field, and both platforms merged it
// identically anyway (see that computed's comment).
export class ScrollView extends ScrollViewBase {}

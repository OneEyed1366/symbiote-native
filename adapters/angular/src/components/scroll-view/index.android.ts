// ScrollView on Android. An Android ScrollView accepts only ONE child, so a RefreshControl can't
// be a sibling of the content the way iOS allows ("addViewAt: failed to insert view ... at index
// 1"). RN solves this by having the RefreshControl (AndroidSwipeRefreshLayout) WRAP the scroll
// view (cloneElement(refreshControl, {style}, scrollView)). Angular mirrors that shape by querying
// a projected <RefreshControl>, re-rendering its native prop surface as the outer wrapper, and
// projecting every non-RefreshControl child into the inner scroll content.
//
// Android needs a different Fabric view per axis for both the outer scroll container
// (RCTScrollView is vertical-only; AndroidHorizontalScrollView is a dedicated ViewManager) and the
// inner content view (horizontal content is AndroidHorizontalScrollContentView, with its own
// ShadowNode::layout() override) — but Angular only reliably projects into a component's
// LAST-declared <ng-content> when 2+ DISTINCT declarations exist (angular/angular#22972), which an
// earlier 4-call-site template (one <ng-content> per axis x refresh-control branch) tripped. Fix:
// exactly ONE `<ng-content>` textually, inside a single top-level `<ng-template>`, re-instantiated
// into whichever branch is active via a local template-outlet directive
// (SymbioteTemplateOutletDirective below, `@angular/common`-free per this adapter's dependency
// policy — see package.json). Only one branch is ever live, so the declaration count stays at one
// and the "last one wins" limitation never triggers. Covered by
// `android-scroll-view-axis-projection.test.ts` and `flat-list-scroll-containment.test.ts`.
//
// Metro picks this on an Android host; no Platform.OS read.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  inject,
  type EmbeddedViewRef,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import {
  HorizontalScrollContentView,
  HorizontalScrollView,
  RefreshControlHost,
  ScrollContentView,
  ScrollViewHost,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
} from '../../primitives';
import { ScrollViewBase, ScrollViewProjectionDirective, SCROLL_VIEW_INPUTS } from './shared';
export type { IAngularScrollViewProps, IScrollViewHandle } from './shared';

// Minimal local twin of `@angular/common`'s NgTemplateOutlet (this adapter deliberately has no
// @angular/common dependency — see package.json): re-instantiates the SAME TemplateRef into
// whichever structural branch below is currently active, so the component's compiled template
// keeps exactly ONE <ng-content> declaration regardless of how many places reference it.
@Directive({
  selector: '[symbioteTemplateOutlet]',
  standalone: true,
})
export class SymbioteTemplateOutletDirective implements OnChanges, OnDestroy {
  @Input() symbioteTemplateOutlet: TemplateRef<unknown> | null = null;

  private readonly viewContainerRef = inject(ViewContainerRef);
  private viewRef: EmbeddedViewRef<unknown> | undefined;

  ngOnChanges(): void {
    if (this.viewRef !== undefined) {
      this.viewRef.destroy();
      this.viewRef = undefined;
    }
    if (this.symbioteTemplateOutlet !== null) {
      this.viewRef = this.viewContainerRef.createEmbeddedView(this.symbioteTemplateOutlet);
    }
  }

  ngOnDestroy(): void {
    this.viewRef?.destroy();
  }
}

// anchorHostStyle returns `unknown` (the anchor's already-resolved style, any shape); narrowed
// here (mirrors the identical `asStyle` in image/shared.ts) rather than `as`-cast to satisfy
// `IStyleProp<IViewStyle>`'s stricter array-element union.
function asStyle(value: unknown): IStyleProp<IViewStyle> | undefined {
  return typeof value === 'object' && value !== null ? value : undefined;
}

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
    HorizontalScrollView,
    HorizontalScrollContentView,
    RefreshControlHost,
    SymbioteHostPropsDirective,
    ScrollViewProjectionDirective,
    SymbioteTemplateOutletDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  inputs: SCROLL_VIEW_INPUTS,
  template: `
    <ng-template #sharedContent>
      <ng-content></ng-content>
    </ng-template>
    @if (isHorizontal) {
      @if (hasProjectedRefreshControl) {
        <symbiote-refresh-control
          #refreshHost="symbioteHost"
          [symbioteHostProps]="androidRefreshControlProps"
          (refresh)="handleProjectedRefresh(refreshHost.node)"
        >
          <symbiote-horizontal-scroll-view
            #host="symbioteHost"
            [symbioteHostProps]="androidWrappedScrollProps()"
          >
            <symbiote-horizontal-scroll-content
              [symbioteHostProps]="contentProps()"
              [symbioteScrollViewProjection]="projectionController"
            >
              <ng-container [symbioteTemplateOutlet]="sharedContent"></ng-container>
            </symbiote-horizontal-scroll-content>
          </symbiote-horizontal-scroll-view>
        </symbiote-refresh-control>
      } @else {
        <symbiote-horizontal-scroll-view #host="symbioteHost" [symbioteHostProps]="scrollProps()">
          <symbiote-horizontal-scroll-content
            [symbioteHostProps]="contentProps()"
            [symbioteScrollViewProjection]="projectionController"
          >
            <ng-container [symbioteTemplateOutlet]="sharedContent"></ng-container>
          </symbiote-horizontal-scroll-content>
        </symbiote-horizontal-scroll-view>
      }
    } @else {
      @if (hasProjectedRefreshControl) {
        <symbiote-refresh-control
          #refreshHost="symbioteHost"
          [symbioteHostProps]="androidRefreshControlProps"
          (refresh)="handleProjectedRefresh(refreshHost.node)"
        >
          <symbiote-scroll-view
            #host="symbioteHost"
            [symbioteHostProps]="androidWrappedScrollProps()"
          >
            <symbiote-scroll-content
              [symbioteHostProps]="contentProps()"
              [symbioteScrollViewProjection]="projectionController"
            >
              <ng-container [symbioteTemplateOutlet]="sharedContent"></ng-container>
            </symbiote-scroll-content>
          </symbiote-scroll-view>
        </symbiote-refresh-control>
      } @else {
        <symbiote-scroll-view #host="symbioteHost" [symbioteHostProps]="scrollProps()">
          <symbiote-scroll-content
            [symbioteHostProps]="contentProps()"
            [symbioteScrollViewProjection]="projectionController"
          >
            <ng-container [symbioteTemplateOutlet]="sharedContent"></ng-container>
          </symbiote-scroll-content>
        </symbiote-scroll-view>
      }
    }
  `,
})
export class ScrollView extends ScrollViewBase {
  // Feeds the anchor's class-derived style INTO the base class's own `splitLayoutProps` call
  // (shared.ts's `androidWrappedScrollProps`/`androidRefreshControlProps`), not tacked on after —
  // a class-only layout style (flex/height/gap/…) must be visible to the split itself, or the
  // Android outer refresh-control wrapper never receives its share and collapses to zero size
  // (a real device bug: the whole ScrollView renders nothing). See layoutSplitStyle's doc comment
  // in shared.ts and the identical fix already shipped in the Vue adapter's scroll-view.
  //
  // Reads the base's `anchorStyle` SIGNAL rather than calling anchorHostStyle() directly: this
  // getter is evaluated inside the `androidWrappedScrollProps` computed, where a plain read would
  // be untracked and leave the memoized bag holding a stale class.
  protected override get layoutSplitStyle(): IStyleProp<IViewStyle> {
    return [asStyle(this.anchorStyle()), this.style];
  }
}

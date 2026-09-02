// createPortal for @symbiote-native/angular — the Angular twin of the React/Vue same-surface portal
// (create-portal.ts / Teleport in runtime-helpers.ts). Scope is identical: the target must be an
// already-mounted location WITHIN THE SAME SURFACE as the portal's call site — moving content
// across independently-mounted surfaces has no safe host-level primitive, so createTunnel
// (create-tunnel.ts) covers that cross-surface case instead.
//
// React/Vue implement this as a thin validating wrapper around a mechanism the framework itself
// already has (react-reconciler's Fiber-level HostPortal, Vue's own <Teleport>). Angular has no
// such built-in (no `@angular/cdk` dependency here, core-only — see package.json), and physically
// moving an EmbeddedView's already-created root nodes via Renderer2 after the fact is NOT safe —
// Angular's own view-destroy path removes a view's nodes from wherever ITS OWN bookkeeping thinks
// they live, not from wherever a node was manually moved to, so a raw Renderer2 move would desync
// Angular's internals from the retained tree.
//
// PortalDirective is a STRUCTURAL directive (`*portal="overlayHost"`), not a component taking a
// separate `<ng-template>` + `[content]` binding — that two-step reads as foreign next to
// `*ngIf`/`*ngFor`/`*ngTemplateOutlet`. `*portal="x"` desugars the same way `*ngIf` does: Angular
// wraps the host element in an `<ng-template>` and injects that template's own TemplateRef into
// the directive automatically.
//
// The safe, fully-public-API mechanism: create the embedded view DIRECTLY inside a
// ViewContainerRef anchored at the destination, so there is nothing to move at all. That
// ViewContainerRef comes from `PortalOutletDirective`, exported to a template variable with the
// same idiom `#form="ngForm"` uses. This also replaces the `isSymbioteNode` runtime guard
// React/Vue need (there `to` is an arbitrary JS value until validated): here `to` is typed as
// `PortalOutletDirective` — the only way to construct one is Angular's own template compiler
// resolving a template reference variable, so `strictTemplates` rejects anything else at compile
// time and there is nothing left to guard at runtime.
//
// THE MARKER GOES ON AN `<ng-container>` INSIDE THE TARGET, never on the target element. A
// ViewContainerRef anchors AT its host and `createEmbeddedView` inserts after that anchor, so
// `<View portalOutlet>` delivers a SIBLING where React's `createPortal(node, host)` and Vue's
// `<Teleport to>` deliver a child. Device-reported 2026-09-02: a card portaled into an absolutely
// positioned overlay laid out in the scroll flow, since the overlay cannot centre a node that is
// not in it.

import {
  Directive,
  ElementRef,
  inject,
  Input,
  TemplateRef,
  ViewContainerRef,
  type EmbeddedViewRef,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';
import { isAnchor, isSymbioteNode } from '@symbiote-native/engine';

/** Marks the destination for `*portal` — place it on whichever already-mounted host should
 *  paint the portaled content — on an `<ng-container>` INSIDE that host, never on the host
 *  element itself (see the file header) — then export it to a template variable and pass that
 *  variable as `*portal`'s target:
 *
 *  ```html
 *  <View class="overlay-host">
 *    <ng-container portalOutlet #overlayHost="portalOutlet"></ng-container>
 *  </View>
 *  ```
 */
@Directive({
  selector: '[portalOutlet]',
  standalone: true,
  exportAs: 'portalOutlet',
})
export class PortalOutletDirective {
  readonly viewContainerRef = inject(ViewContainerRef);

  constructor() {
    // The wrong placement commits a valid tree that simply differs from React's, so nothing
    // downstream can catch it. It has to fail where it is written.
    const host: unknown = inject(ElementRef).nativeElement;
    if (!isSymbioteNode(host) || !isAnchor(host)) {
      throw new Error(
        'portalOutlet must sit on an <ng-container> inside the target host, not on the host ' +
          'element: a ViewContainerRef anchored at an element inserts AFTER it, so the ported ' +
          'content would become the host\'s sibling. Write <View class="…">' +
          '<ng-container portalOutlet #x="portalOutlet"></ng-container></View>.',
      );
    }
  }
}

/** `*portal="overlayHost"` — renders the host element into whichever `PortalOutletDirective`
 *  `overlayHost` refers to, same surface only (see the file header). Combine with `@if` for
 *  conditional visibility, exactly like `*ngIf`. */
@Directive({ selector: '[portal]', standalone: true })
export class PortalDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) portal!: PortalOutletDirective;

  private readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
  private viewRef: EmbeddedViewRef<unknown> | null = null;

  ngOnChanges(): void {
    this.viewRef?.destroy();
    this.viewRef = this.portal.viewContainerRef.createEmbeddedView(
      this.templateRef,
    );
  }

  ngOnDestroy(): void {
    this.viewRef?.destroy();
  }
}

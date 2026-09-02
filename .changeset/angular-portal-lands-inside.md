---
'@symbiote-native/angular': minor
---

`createPortal` now delivers content INSIDE the target host, matching React and Vue.

A `ViewContainerRef` anchors at its host element and `createEmbeddedView` inserts after that
anchor, so `<View portalOutlet>` made the ported content the host's SIBLING — an app's overlay
could not lay it out, because the node was never in the overlay.

The outlet marker therefore goes on an `<ng-container>` inside the target:

```html
<View class="overlay-host">
  <ng-container portalOutlet #overlayHost="portalOutlet"></ng-container>
</View>
```

`PortalOutletDirective` throws when the marker sits on a real element instead, since the wrong
placement otherwise commits a divergent tree with nothing to detect it.

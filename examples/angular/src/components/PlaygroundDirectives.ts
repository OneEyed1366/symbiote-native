import {
  Directive,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';

// Custom attribute directive (@Directive selector) + exportAs: the query section below reads
// this both as a decorator target (@ViewChild/@ContentChild) and via a template reference
// variable (#ref="queryItem"), and PlaygroundHostBindingTile composes it through
// hostDirectives. One small directive, three checklist rows.
@Directive({
  selector: '[playgroundQueryItem]',
  standalone: true,
  exportAs: 'queryItem',
})
export class PlaygroundQueryItemDirective {
  @Input() label = '';
}

export type IPlaygroundLayoutSize = {
  width: number;
  height: number;
};

function readLayoutSize(
  nativeEvent: unknown,
): IPlaygroundLayoutSize | undefined {
  if (typeof nativeEvent !== 'object' || nativeEvent === null) return undefined;
  const layout = Reflect.get(nativeEvent, 'layout');
  if (typeof layout !== 'object' || layout === null) return undefined;
  const width = Reflect.get(layout, 'width');
  const height = Reflect.get(layout, 'height');
  return typeof width === 'number' && typeof height === 'number'
    ? { width, height }
    : undefined;
}

// @HostListener demo, deliberately NOT bound to a component OUTPUT ('press' on Pressable is an
// Angular EventEmitter subscription, not a Renderer2.listen() target - it would never fire here)
// and NOT a `window:`/`document:` global (renderer/index.ts's listen() no-ops for those, see the
// Lifecycle section's afterRender callout). 'layout' is the safe case: a genuine LOCAL event the
// engine dispatches straight on any real Fabric node (core/engine/src/node.ts's LAYOUT_EVENT), so
// it reaches a plain View the same way RN's own onLayout would.
@Directive({
  selector: '[playgroundLayoutWatcher]',
  standalone: true,
})
export class PlaygroundLayoutWatcherDirective {
  @Output() readonly playgroundLayout =
    new EventEmitter<IPlaygroundLayoutSize>();

  // ngtsc doesn't know the custom 'layout' event name, so it types $event as the ambient DOM
  // `Event` (this app's tsconfig pulls in "DOM" lib types purely for @angular/core's own .d.ts
  // surface, per angular-adapter §16's tsconfig note) - the real payload at runtime is our
  // ISymbioteEvent, read off via a runtime guard rather than an `as Event` cast.
  @HostListener('layout', ['$event'])
  onLayout(event: Event): void {
    const nativeEvent: unknown = Reflect.get(event, 'nativeEvent');
    const size = readLayoutSize(nativeEvent);
    if (size !== undefined) this.playgroundLayout.emit(size);
  }
}

// `host: {...}` metadata: the declarative twin of @HostBinding/@HostListener, same compiled
// instructions, demoed on a plain View (a real Fabric node, not a composed component's anchor -
// see PlaygroundHostBindingTile for the anchor-merge-back case).
@Directive({
  selector: '[playgroundHostMeta]',
  standalone: true,
  exportAs: 'hostMeta',
  host: {
    '[class.pg-host-meta-active]': 'active',
    '(layout)': 'onLayout()',
  },
})
export class PlaygroundHostMetaDirective {
  active = false;

  onLayout(): void {
    this.active = true;
  }
}

// Angular primitive host components over Symbiote engine intrinsics. These are the only
// components that directly own the `symbiote-*` selectors; every composed adapter
// component imports them and renders them in its template. Declaring `style` as a real
// Angular input prevents Angular's CSS style engine from decomposing RN `StyleProp` arrays.

import { Component } from '@angular/core';
import { SymbiotePrimitiveHost } from './shared';

export {
  anchorHostStyle,
  anchorStyleProp,
  stableAnchorStyle,
  SymbioteHostPropsDirective,
} from './shared';

@Component({
  selector: 'symbiote-view, View',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ViewHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-text, Text',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class TextHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-image',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ImageHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-scroll-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ScrollViewHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-scroll-content',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ScrollContentView extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-horizontal-scroll-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class HorizontalScrollView extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-horizontal-scroll-content',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class HorizontalScrollContentView extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-text-input',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class TextInputHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-text-input-multiline',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class MultilineTextInputHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-switch',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class SwitchHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-activity-indicator',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ActivityIndicatorHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-safe-area-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class SafeAreaViewHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-modal',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ModalHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-refresh-control',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class RefreshControlHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-input-accessory-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class InputAccessoryViewHost extends SymbiotePrimitiveHost {}

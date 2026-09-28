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
  SymbioteStyleInputDirective,
} from './shared';

@Component({
  selector: 'view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ViewHost extends SymbiotePrimitiveHost {}

// Text is an ordinary primitive host — no `@Input()`s for defaults; `foldTextDefaults` (C++)
// reads the authored bag directly, so an absent value never needs declaring here.
@Component({
  selector: 'text',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class TextHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'image',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ImageHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'scroll-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ScrollViewHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'scroll-content',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ScrollContentView extends SymbiotePrimitiveHost {}

@Component({
  selector: 'horizontal-scroll-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class HorizontalScrollView extends SymbiotePrimitiveHost {}

@Component({
  selector: 'horizontal-scroll-content',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class HorizontalScrollContentView extends SymbiotePrimitiveHost {}

@Component({
  selector: 'text-input',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class TextInputHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'text-input-multiline',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class MultilineTextInputHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'switch',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class SwitchHost extends SymbiotePrimitiveHost {}

// The centering RCTView RN wraps the spinner in (ActivityIndicator.js:112) is
// `activity-indicator-spinner`, built by the engine's ActivityIndicator behavior — nothing writes
// it in a template, so it needs no host here.
@Component({
  selector: 'activity-indicator',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ActivityIndicatorHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'safe-area-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class SafeAreaViewHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'modal',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ModalHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'refresh-control',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class RefreshControlHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'input-accessory-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class InputAccessoryViewHost extends SymbiotePrimitiveHost {}

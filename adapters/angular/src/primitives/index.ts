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

/**
 * Text is an ORDINARY primitive host as of 2026-09-18, and the two `@Input()`s it used to declare
 * are gone with the code that needed them.
 *
 * They existed for one stated reason: a default can only be applied by code that can SEE whether the
 * caller supplied a value, and a pass-through host binding is invisible to the component — so the
 * defaults had to be applied where the inputs were readable. That argument was sound and it is now
 * answered one layer down. The payload builder reads the AUTHORED bag, so it can tell an absent
 * `ellipsizeMode` from an explicit `clip` without anyone declaring anything; the rule is keyed on the
 * component (`foldTextDefaults`, `SymbioteFabricProps.cpp`) and reaches every `RCTText` however it
 * was spelled.
 *
 * The pass-through is therefore the CORRECT path for both props now, and `text-defaults.test.ts`'s
 * "never overwrites a value the caller supplied" is what proves the authored value still arrives.
 */
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

// The centering RCTView RN wraps the spinner in (ActivityIndicator.js:112), not the spinner —
// which is what this tag resolved to until 2026-09-09. The native view moved to
// `activity-indicator-spinner`, built by the engine's ActivityIndicator behavior, so nothing writes
// it in a template and it needs no host here.
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

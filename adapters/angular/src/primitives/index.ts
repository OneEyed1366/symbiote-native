// Angular primitive host components over Symbiote engine intrinsics. These are the only
// components that directly own the `symbiote-*` selectors; every composed adapter
// component imports them and renders them in its template. Declaring `style` as a real
// Angular input prevents Angular's CSS style engine from decomposing RN `StyleProp` arrays.

import {
  Component,
  Input,
  type OnInit,
  type SimpleChanges,
} from '@angular/core';
import {
  resolveTextProps,
  type IEllipsizeMode,
} from '@symbiote-native/components';
import { SymbiotePrimitiveHost } from './shared';

export {
  anchorHostStyle,
  anchorStyleProp,
  stableAnchorStyle,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
} from './shared';

@Component({
  selector: 'symbiote-view, View',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ViewHost extends SymbiotePrimitiveHost {}

/**
 * Text carries the two defaults RN's Text.js applies unconditionally (`ellipsizeMode ?? 'tail'`,
 * `allowFontScaling !== false`, Text.js:289 and :291). Without them native falls back to `clip` and a
 * clamped Text cuts mid-word with no ellipsis — device-observed on the other adapters 2026-08-19.
 *
 * They are declared as real `@Input()`s, unlike the pass-through props the base's comment
 * describes, for one reason: the default can only be applied by code that can SEE whether the
 * caller supplied a value. A host-binding pass-through is invisible here, so blindly writing
 * 'tail' would silently overwrite an explicit `ellipsizeMode="clip"`.
 */
@Component({
  selector: 'symbiote-text, Text',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class TextHost extends SymbiotePrimitiveHost implements OnInit {
  @Input() ellipsizeMode?: IEllipsizeMode;
  @Input() allowFontScaling?: boolean;

  // ngOnChanges fires before ngOnInit when a binding exists, and not at all when none does —
  // so both hooks are needed to guarantee the defaults land exactly once per settled value.
  ngOnInit(): void {
    this.applyTextDefaults();
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if ('ellipsizeMode' in changes || 'allowFontScaling' in changes) {
      this.applyTextDefaults();
    }
  }

  private applyTextDefaults(): void {
    const resolved = resolveTextProps({
      ellipsizeMode: this.ellipsizeMode,
      allowFontScaling: this.allowFontScaling,
    });
    this.setHostProp('ellipsizeMode', resolved.ellipsizeMode);
    this.setHostProp('allowFontScaling', resolved.allowFontScaling);
  }
}

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

// The pair the LOWERED path commits — declared so the tag alphabet stays complete, though no
// Angular template renders them: this adapter has no lowering transform. The `-managed` pair below
// is what its own TextInput renders.
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
  selector: 'symbiote-text-input-managed',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ManagedTextInputHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-text-input-multiline-managed',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ManagedMultilineTextInputHost extends SymbiotePrimitiveHost {}

@Component({
  selector: 'symbiote-switch',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class SwitchHost extends SymbiotePrimitiveHost {}

// The component path's spelling — same native Switch/AndroidSwitch, a tag the engine's Switch
// behavior does not carry. See `component-names/shared.ts` for why the wrapper may not share the
// lowered tag; mirrors `ManagedTextInputHost` above.
@Component({
  selector: 'symbiote-switch-managed',
  standalone: true,
  template: '<ng-content></ng-content>',
})
export class ManagedSwitchHost extends SymbiotePrimitiveHost {}

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

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
  selector: 'view',
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
  selector: 'text',
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
    // NOTHING TO OVERRIDE, NOTHING TO WRITE. The renderer already SEEDS both defaults at
    // `createElement` (`renderer/index.ts`, "seeding here therefore covers both the composed Text
    // and a bare `text` tag") with exactly `resolveTextProps({})` — so when the caller supplied
    // neither input, this would re-send the values that are already there.
    //
    // It was costing a write per text node per default: measured on a 1 000-row create,
    // `ellipsizeMode` and `allowFontScaling` were each recorded 6 000 times for 3 000 text nodes,
    // ~17% of everything the adapter emitted. The host turns the repeat away when it applies it,
    // but the op is still built, buffered and carried across.
    //
    // The moment either input IS supplied, the pair must still be written in full: `resolveTextProps`
    // resolves them together, and the seed is what an explicit `ellipsizeMode="clip"` overrides.
    if (this.ellipsizeMode === undefined && this.allowFontScaling === undefined)
      return;
    const resolved = resolveTextProps({
      ellipsizeMode: this.ellipsizeMode,
      allowFontScaling: this.allowFontScaling,
    });
    this.setHostProp('ellipsizeMode', resolved.ellipsizeMode);
    this.setHostProp('allowFontScaling', resolved.allowFontScaling);
  }
}

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

import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  ElementRef,
  forwardRef,
  inject,
  signal,
  type DoCheck,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { anchorHostStyle, SwitchHost, SymbioteHostPropsDirective, SymbioteStyleInputDirective } from '../../primitives';
import { SwitchBase } from './shared';
export type { ISwitchProps, ISwitchTrackColor } from './shared';

@Component({
  selector: 'Switch',
  standalone: true,
  hostDirectives: [{ directive: SymbioteStyleInputDirective, inputs: ['style'] }],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SwitchHost, SymbioteHostPropsDirective],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Switch), multi: true }],
  inputs: [
    'value',
    'disabled',
    'trackColor',
    'thumbColor',
    'ios_backgroundColor',
    'style',
    'nativeID',
    'testID',
    'accessibilityLabel',
    'accessibilityRole',
    'accessibilityState',
    'accessibilityValue',
    'accessibilityHint',
    'accessible',
    'role',
    'aria-label',
    'aria-disabled',
    'aria-checked',
  ],
  outputs: ['valueChange', 'change'],
  template: `
    <symbiote-switch
      #nativeSwitch="symbioteHost"
      [symbioteHostProps]="hostProps()"
      (change)="handleChange($event, nativeSwitch)"
    />
  `,
})
export class Switch extends SwitchBase implements DoCheck {
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the <symbiote-switch> leaf one level down.
  private readonly elementRef = inject(ElementRef);

  protected readonly platform = {
    snapBackCommand: 'setValue',
    trackColorProps: (_value: boolean, trackColor?: { false?: string; true?: string }) => ({
      onTintColor: trackColor?.true,
      tintColor: trackColor?.false,
    }),
  };

  // The anchor's class-derived style is written by the renderer's addClass/removeClass and never
  // reaches Angular's input pipeline (a bare `class="x"` never appears in SimpleChanges — see
  // anchorHostStyle's doc comment), so SwitchBase's inputsRevision cannot see it. Hence its own
  // signal: a plain field read inside a computed() would be untracked and the bag would go stale
  // the moment a `[class.x]`/`[ngClass]` toggled.
  //
  // ngDoCheck is the right cadence: render3's callHooks flushes a node's pre-order hooks at the
  // next `ɵɵadvance` past it (or in refreshView's post-template flush), i.e. AFTER the declaring
  // template's ɵɵclassProp wrote the class onto this element and BEFORE this component's own view
  // refreshes — the exact window a class poll needs. callHooks also runs under
  // setActiveConsumer(null), so the write registers no dependency on the caller's view (no NG0600).
  // commitClassStyle allocates a fresh style array only when a token actually moved, so signal.set's
  // own Object.is check makes an unchanged poll a no-op that dirties nothing.
  //
  // Known gap, shared with every other component polling this way (Pressable, SafeAreaView,
  // TouchableNativeFeedback): `[ngClass]` applies its tokens from NgClass's OWN ngDoCheck, and a
  // node's hooks flush in registration order with the component's first, so an [ngClass] flip lands
  // one pass after this poll reads it. `class=` and `[class.x]` are written by the declaring
  // template's styling instructions and so are always current here.
  private readonly anchorStyle = signal<unknown>(undefined);

  ngDoCheck(): void {
    this.anchorStyle.set(anchorHostStyle(this.elementRef));
  }

  // The anchor's class-derived style goes first, then whatever SwitchBase already resolved
  // (its own explicit `style` @Input plus the ios_backgroundColor fold), so an explicit [style]
  // still beats the ambient class.
  protected override buildHostProps(): Record<string, unknown> {
    const props = super.buildHostProps();
    return { ...props, style: [this.anchorStyle(), props['style']] };
  }
}

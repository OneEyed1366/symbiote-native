import { CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, inject } from '@angular/core';
import { anchorHostStyle, SwitchHost, SymbioteHostPropsDirective } from '../../primitives';
import { SwitchBase } from './shared';
export type { ISwitchProps, ISwitchTrackColor } from './shared';

@Component({
  selector: 'Switch',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SwitchHost, SymbioteHostPropsDirective],
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
      [symbioteHostProps]="hostProps"
      (change)="handleChange($event, nativeSwitch)"
    />
  `,
})
export class Switch extends SwitchBase {
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the <symbiote-switch> leaf one level down.
  private readonly elementRef = inject(ElementRef);

  protected readonly platform = {
    snapBackCommand: 'setNativeValue',
    trackColorProps: (value: boolean, trackColor?: { false?: string; true?: string }) => ({
      trackColorForFalse: trackColor?.false,
      trackColorForTrue: trackColor?.true,
      trackTintColor: value ? trackColor?.true : trackColor?.false,
    }),
  };

  // The anchor's class-derived style goes first, then whatever SwitchBase already resolved
  // (its own explicit `style` @Input plus the ios_backgroundColor fold), so an explicit [style]
  // still beats the ambient class.
  override get hostProps(): Record<string, unknown> {
    const props = super.hostProps;
    return { ...props, style: [anchorHostStyle(this.elementRef), props['style']] };
  }
}

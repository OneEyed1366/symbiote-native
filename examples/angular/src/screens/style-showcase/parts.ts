import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const OFF_TINT = '#41506a';

// A press leaves as the `toggle` output, Angular's own idiom for a callback prop
@Component({
  selector: 'ShowcaseToggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  template: `
    <ActionButton
      [testID]="testID()"
      [title]="buttonTitle()"
      [color]="buttonColor()"
      (press)="toggle.emit()"
    ></ActionButton>
  `,
})
export class ShowcaseToggle {
  readonly label = input.required<string>();
  readonly active = input.required<boolean>();
  readonly testID = input.required<string>();
  readonly toggle = output<void>();

  readonly buttonTitle = computed(
    () => `${this.label()} — ${this.active() ? 'on' : 'off'}`,
  );

  readonly buttonColor = computed(() =>
    this.active() ? LINE_COLOR.styling : OFF_TINT,
  );
}

// Half of a side-by-side pair: a label, the projected tile and the caption
@Component({
  selector: 'ShowcaseTile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="sc-pair-half">
      <text class="sc-tile-label">{{ label() }}</text>
      <ng-content></ng-content>
      <text class="sc-tile-caption">{{ caption() }}</text>
    </view>
  `,
})
export class ShowcaseTile {
  readonly label = input.required<string>();
  readonly caption = input.required<string>();
}

// Written out, not hidden in a helper, since the readout under each dynamic tile prints this string
export function classList(
  base: string,
  modifiers: Record<string, boolean>,
): string {
  const on = Object.keys(modifiers).filter(name => modifiers[name]);
  return [base, ...on].join(' ');
}

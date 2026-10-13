import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Input,
} from '@angular/core';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { sharedTransitionBoundaryProps } from '../core/shared-transition-boundary';

// The tag below is the name of upstream's native boundary view, which a template cannot read from
// the spec, so the test of this component looks the view up by that name
@Component({
  selector: 'SharedTransitionBoundary',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<REASharedTransitionBoundary [symbioteHostProps]="hostProps">
    <ng-content />
  </REASharedTransitionBoundary>`,
})
export class SharedTransitionBoundary {
  @Input({ required: true }) isActive!: boolean;

  get hostProps(): Record<string, unknown> {
    return sharedTransitionBoundaryProps(this.isActive);
  }
}

export type ISharedTransitionBoundaryProps = { isActive: boolean };

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Input,
} from '@angular/core';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { layoutAnimationScopeProps } from '../core/layout-animation-scope';

// `skipEntering` and `skipExiting` as upstream has them: the children neither animate in nor out
@Component({
  selector: 'LayoutAnimationConfig',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<view [symbioteHostProps]="hostProps"><ng-content /></view>`,
})
export class LayoutAnimationConfig {
  @Input() skipEntering?: boolean;
  @Input() skipExiting?: boolean;

  get hostProps(): Record<string, unknown> {
    return layoutAnimationScopeProps({
      skipEntering: this.skipEntering,
      skipExiting: this.skipExiting,
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { warnIfViewNameIsDynamic } from '@symbiote-native/engine';
import { LINEAR_GRADIENT_MODULE_NAME } from '../../core';
import { LinearGradientBase } from './shared';

const TEMPLATE_TAG = 'ViewManagerAdapter_ExpoLinearGradient';

/** Angular twin of `expo-linear-gradient`'s `LinearGradient`, children go inside the native view */
@Component({
  selector: 'LinearGradient',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Имя тега это нативное имя view, его нельзя собрать динамически
  template: `@if (descriptor; as node) {
    <ViewManagerAdapter_ExpoLinearGradient [symbioteHostProps]="node.props">
      <ng-content />
    </ViewManagerAdapter_ExpoLinearGradient>
  }`,
})
export class LinearGradient extends LinearGradientBase {
  constructor() {
    super();
    warnIfViewNameIsDynamic(TEMPLATE_TAG, LINEAR_GRADIENT_MODULE_NAME);
  }
}

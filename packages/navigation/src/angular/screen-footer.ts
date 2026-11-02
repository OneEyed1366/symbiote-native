// Angular `ScreenFooter`: the native footer view of a `formSheet`, view props ride one input bag

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';

@Component({
  selector: 'ScreenFooter',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <RNSScreenFooter [symbioteHostProps]="viewProps"
      ><ng-content
    /></RNSScreenFooter>
  `,
})
export class ScreenFooter {
  @Input() viewProps: Record<string, unknown> = {};
}

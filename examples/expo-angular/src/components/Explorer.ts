import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  TemplateRef,
  contentChild,
  input,
  signal,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from './ActionButton';

// Every remaining API call of the package, collapsed so the scenarios above stay the main story.
// The body is an `<ng-template>` so nothing inside it is created before the first open
@Component({
  selector: 'Explorer',
  standalone: true,
  imports: [ActionButton, NgTemplateOutlet, SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="explorer">
      <ActionButton
        [testID]="testID() + '-toggle'"
        [title]="
          isOpen()
            ? 'Hide API explorer'
            : 'Open API explorer: every call and option'
        "
        [color]="color()"
        (press)="isOpen.set(!isOpen())"
      />
      @if (isOpen()) {
        <ng-container [ngTemplateOutlet]="body()" />
      }
    </view>
  `,
})
export class Explorer {
  readonly testID = input.required<string>();
  readonly color = input.required<string>();
  readonly body = contentChild.required(TemplateRef);
  readonly isOpen = signal(false);
}

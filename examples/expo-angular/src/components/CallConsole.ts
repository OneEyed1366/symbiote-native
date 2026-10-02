import { NgTemplateOutlet } from '@angular/common';
import { Component, booleanAttribute, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from './ActionButton';
import { Card } from './Card';
import { slug, summarize } from './call-console';
import type { ICall } from './call-console';

// One button per API call, the shared output line shows the resolved value or the error.
// `isBare` renders the console inside a Scenario, without a card of its own
@Component({
  selector: 'CallConsole',
  standalone: true,
  imports: [ActionButton, Card, NgTemplateOutlet, SYMBIOTE_ELEMENTS],
  template: `
    <ng-template #body>
      @if (hint() !== undefined) {
        <text class="info-text">{{ hint() }}</text>
      }
      <view class="button-row">
        @for (call of calls(); track call.label) {
          <ActionButton
            [testID]="prefix() + '-' + slug(call.label)"
            [title]="call.label"
            [color]="color()"
            (press)="invoke(call)"
          />
        }
      </view>
      <text [testID]="prefix() + '-output'" class="info-text">{{
        output()
      }}</text>
    </ng-template>

    @if (isBare()) {
      <view [testID]="prefix() + '-card'" class="console-bare">
        <ng-container [ngTemplateOutlet]="body" />
      </view>
    } @else {
      <Card [testID]="prefix() + '-card'" [title]="title()">
        <ng-container [ngTemplateOutlet]="body" />
      </Card>
    }
  `,
})
export class CallConsole {
  readonly prefix = input.required<string>();
  readonly title = input.required<string>();
  readonly calls = input.required<readonly ICall[]>();
  readonly color = input.required<string>();
  readonly hint = input<string>();
  readonly isBare = input(false, { transform: booleanAttribute });

  readonly output = signal('no call yet');
  readonly slug = slug;

  invoke(call: ICall): void {
    this.output.set(`${call.label}…`);
    Promise.resolve()
      .then(call.run)
      .then(value => this.output.set(`${call.label} ->\n${summarize(value)}`))
      .catch((error: Error) =>
        this.output.set(`${call.label} failed: ${error.message}`),
      );
  }
}

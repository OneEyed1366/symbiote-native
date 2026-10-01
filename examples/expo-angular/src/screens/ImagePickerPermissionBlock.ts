import { Component, computed, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { describePermission } from './image-picker-permission';
import type { IPermissionLike } from './image-picker-permission';

@Component({
  selector: 'ImagePickerPermissionBlock',
  standalone: true,
  imports: [ActionButton, ResultRow, SYMBIOTE_ELEMENTS],
  template: `
    <view>
      <text class="feature-card-title">{{ title() }}</text>
      <ResultRow
        [testID]="prefix() + '-hook'"
        label="hook state"
        [value]="hookState()"
      />
      <ActionButton
        [testID]="prefix() + '-hook-request'"
        title="hook request()"
        [color]="color()"
        (press)="hookRequest()()"
      />
      <ActionButton
        [testID]="prefix() + '-get'"
        title="get…PermissionsAsync"
        [color]="color()"
        (press)="run(directGet())"
      />
      <ActionButton
        [testID]="prefix() + '-request'"
        title="request…PermissionsAsync"
        [color]="color()"
        (press)="run(directRequest())"
      />
      <ResultRow
        [testID]="prefix() + '-direct'"
        label="direct call"
        [value]="direct()"
      />
    </view>
  `,
})
export class ImagePickerPermissionBlock {
  readonly prefix = input.required<string>();
  readonly title = input.required<string>();
  readonly color = input.required<string>();
  readonly hookResponse = input.required<IPermissionLike | null>();
  readonly hookRequest = input.required<() => Promise<unknown>>();
  readonly directGet = input.required<() => Promise<IPermissionLike>>();
  readonly directRequest = input.required<() => Promise<IPermissionLike>>();

  readonly direct = signal('not called');
  readonly hookState = computed(() => describePermission(this.hookResponse()));

  run(call: () => Promise<IPermissionLike>): void {
    call()
      .then(response => this.direct.set(describePermission(response)))
      .catch((error: Error) => this.direct.set(`failed: ${error.message}`));
  }
}

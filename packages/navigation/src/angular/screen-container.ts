// Angular `ScreenContainer`: core picks the native view, the template renders the matching tag
// A tag cannot be dynamic in a template, so a switch picks one and the content is projected once

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Platform, SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { resolveScreenContainerViewName } from '../core';
import type { IScreenContainerProps } from '../core';

@Component({
  selector: 'ScreenContainer',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [NgTemplateOutlet, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #content><ng-content /></ng-template>
    @switch (viewName()) {
      @case ('RNSScreenContainer') {
        <RNSScreenContainer [symbioteHostProps]="viewProps">
          <ng-container [ngTemplateOutlet]="content" />
        </RNSScreenContainer>
      }
      @case ('RNSScreenNavigationContainer') {
        <RNSScreenNavigationContainer [symbioteHostProps]="viewProps">
          <ng-container [ngTemplateOutlet]="content" />
        </RNSScreenNavigationContainer>
      }
      @default {
        <view [symbioteHostProps]="viewProps">
          <ng-container [ngTemplateOutlet]="content" />
        </view>
      }
    }
  `,
})
export class ScreenContainer implements IScreenContainerProps {
  @Input() enabled?: boolean;
  @Input() hasTwoStates?: boolean;
  @Input() viewProps: Record<string, unknown> = {};

  viewName(): string {
    return resolveScreenContainerViewName({
      enabled: this.enabled,
      hasTwoStates: this.hasTwoStates,
      os: Platform.OS,
    });
  }
}

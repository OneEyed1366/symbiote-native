import { Component, signal } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * @symbiote-native/system-ui canary demo: a live root-view background-color card, seeded via
 * getBackgroundColorAsync() and refreshed after every setBackgroundColorAsync() call. Every
 * function is a plain re-export off the core package — no service to inject(), same shape as
 * @symbiote-native/crypto's plain-function surface.
 */
@Component({
  selector: 'SystemUiScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="system-ui-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">System UI</text>
            <text class="hero-body">
              @symbiote-native/system-ui — get/set the root view's background
              color, the color painted behind the RN surface before any content
              mounts.
            </text>
          </view>
        </view>

        <view testID="system-ui-background-card" class="capability-card">
          <text class="capability-card-title">Root background color</text>
          <view class="capability-row">
            <text class="capability-label">Current color</text>
            <text testID="system-ui-color-result" class="value-text">{{
              colorLabel()
            }}</text>
          </view>
          <view class="button-row">
            <ActionButton
              testID="system-ui-set-red"
              title="Red"
              [color]="lineColor"
              (press)="handleSetColor('#ef4444')"
            ></ActionButton>
            <ActionButton
              testID="system-ui-set-blue"
              title="Blue"
              [color]="lineColor"
              (press)="handleSetColor('#3b82f6')"
            ></ActionButton>
            <ActionButton
              testID="system-ui-reset"
              title="Reset"
              [color]="lineColor"
              (press)="handleSetColor(null)"
            ></ActionButton>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class SystemUiScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly color = signal<string | null | 'checking'>('checking');

  constructor() {
    this.refreshColor();
  }

  handleSetColor(color: string | null): void {
    setBackgroundColorAsync(color).then(() => this.refreshColor());
  }

  colorLabel(): string {
    const value = this.color();
    if (value === 'checking') return 'checking…';
    return value ?? 'not set';
  }

  private refreshColor(): void {
    getBackgroundColorAsync().then(value => {
      this.color.set(typeof value === 'string' ? value : null);
    });
  }
}

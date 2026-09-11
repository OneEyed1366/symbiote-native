import { Component, inject } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
import {
  Orientation,
  OrientationLock,
  ScreenOrientationService,
  lockAsync,
  unlockAsync,
} from '@symbiote-native/screen-orientation/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * @symbiote-native/screen-orientation canary demo: a live `{ orientation, orientationLock }` card
 * driven by ScreenOrientationService.connect() (seeded via getOrientationAsync()/
 * getOrientationLockAsync(), refreshed by addOrientationChangeListener()), plus lock/unlock
 * buttons. Angular twin of ../../react/screens/ScreenOrientationScreen.tsx. Orientation/
 * OrientationLock are numeric TS enums, so `Orientation[value]`/`OrientationLock[value]` reads
 * back the member name via the compiler's own reverse mapping — no hand-written label switch
 * needed.
 */
@Component({
  selector: 'ScreenOrientationScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="screen-orientation-scroll"
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
            <text class="hero-title">Screen Orientation</text>
            <text class="hero-body">
              @symbiote-native/screen-orientation — lock the screen to
              portrait/landscape, or unlock it back to the system default, with
              live orientation-change updates.
            </text>
          </view>
        </view>

        <view testID="screen-orientation-live-card" class="capability-card">
          <text class="capability-card-title">Live orientation</text>
          <view class="capability-row">
            <text class="capability-label">Orientation</text>
            <text testID="screen-orientation-value" class="value-text">{{
              orientationLabel()
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Orientation lock</text>
            <text testID="screen-orientation-lock-value" class="value-text">{{
              orientationLockLabel()
            }}</text>
          </view>
        </view>

        <view testID="screen-orientation-actions-card" class="capability-card">
          <text class="capability-card-title">Actions</text>
          <view class="button-row">
            <ActionButton
              testID="screen-orientation-lock-portrait"
              title="Lock portrait"
              [color]="lineColor"
              (press)="handleLockPortrait()"
            ></ActionButton>
            <ActionButton
              testID="screen-orientation-lock-landscape"
              title="Lock landscape"
              [color]="lineColor"
              (press)="handleLockLandscape()"
            ></ActionButton>
            <ActionButton
              testID="screen-orientation-unlock"
              title="Unlock"
              [color]="lineColor"
              (press)="handleUnlock()"
            ></ActionButton>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class ScreenOrientationScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly screenOrientation = inject(ScreenOrientationService).connect();

  handleLockPortrait(): void {
    void lockAsync(OrientationLock.PORTRAIT_UP);
  }

  handleLockLandscape(): void {
    void lockAsync(OrientationLock.LANDSCAPE);
  }

  handleUnlock(): void {
    void unlockAsync();
  }

  orientationLabel(): string {
    return Orientation[this.screenOrientation().orientation];
  }

  orientationLockLabel(): string {
    return OrientationLock[this.screenOrientation().orientationLock];
  }
}

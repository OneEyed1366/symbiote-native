import { Component, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  Orientation,
  OrientationLock,
  ScreenOrientationService,
  lockAsync,
  unlockAsync,
} from '@symbiote-native/screen-orientation/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

function orientationLabel(orientation: Orientation): string {
  switch (orientation) {
    case Orientation.PORTRAIT_UP:
      return 'Portrait up';
    case Orientation.PORTRAIT_DOWN:
      return 'Portrait down';
    case Orientation.LANDSCAPE_LEFT:
      return 'Landscape left';
    case Orientation.LANDSCAPE_RIGHT:
      return 'Landscape right';
    case Orientation.UNKNOWN:
    default:
      return 'Unknown';
  }
}

function orientationLockLabel(orientationLock: OrientationLock): string {
  return OrientationLock[orientationLock] ?? 'Unknown';
}

@Component({
  selector: 'ScreenOrientationScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="screen-orientation-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Screen Orientation</text>
            <text class="hero-body">
              Control how the screen rotates: lock portrait or landscape for a
              video, a game or a form, unlock it again, and follow the current
              orientation live.
            </text>
          </view>
        </view>

        <Scenario
          testID="screen-orientation-scenario"
          title="Lock landscape for a video player or a game"
          why="Full-screen video and games need landscape no matter how the phone is held, while forms and feeds work best locked to portrait. Unlock hands control back to the user."
          [steps]="scenarioSteps"
          expect="The screen stays in the locked orientation however you hold the phone, and rotates freely again after Unlock. The state card shows both values."
        />

        <view testID="screen-orientation-state-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Current state</text>
          </view>
          <ValueRow
            label="Orientation"
            [value]="orientationText(screenOrientation().orientation)"
          />
          <ValueRow
            label="Orientation lock"
            [value]="lockText(screenOrientation().orientationLock)"
          />
        </view>

        <view testID="screen-orientation-actions-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Actions</text>
          </view>
          <ActionButton
            testID="screen-orientation-lock-portrait-button"
            title="Lock portrait"
            [color]="lineColor"
            (press)="lockPortrait()"
          />
          <ActionButton
            testID="screen-orientation-lock-landscape-button"
            title="Lock landscape"
            [color]="lineColor"
            (press)="lockLandscape()"
          />
          <ActionButton
            testID="screen-orientation-unlock-button"
            title="Unlock"
            [color]="lineColor"
            (press)="unlock()"
          />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class ScreenOrientationScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation];
  readonly lineColor = LINE_COLOR['screen-orientation'];
  readonly badgeStyle = { backgroundColor: LINE_COLOR['screen-orientation'] };
  readonly orientationText = orientationLabel;
  readonly lockText = orientationLockLabel;
  readonly scenarioSteps = [
    'Press Lock landscape and turn the phone',
    'Press Lock portrait',
    'Press Unlock and turn the phone again',
  ];

  readonly screenOrientation = inject(ScreenOrientationService).connect();

  lockPortrait(): void {
    void lockAsync(OrientationLock.PORTRAIT_UP);
  }

  lockLandscape(): void {
    void lockAsync(OrientationLock.LANDSCAPE_LEFT);
  }

  unlock(): void {
    void unlockAsync();
  }
}

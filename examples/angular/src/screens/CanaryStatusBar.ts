import { Component, signal } from '@angular/core';
import {
  Platform,
  StatusBar,
  SYMBIOTE_ELEMENTS,
} from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { ACCENT } from './canary-shared';

const BAR_RED = '#dd0031';
const BAR_DEFAULT = '#111827';
const FADE = 'fade';

// JS -> native: the status bar is driven imperatively, watch the top strip react
@Component({
  selector: 'CanaryStatusBar',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="row">
      <view class="flex-1">
        <ActionButton
          testID="angular-status-bar-hidden-btn"
          [title]="isHidden() ? 'Show status bar' : 'Hide status bar'"
          (press)="toggleHidden()"
          [color]="accent"
        />
      </view>
      <view class="flex-1">
        <ActionButton
          testID="angular-status-bar-style-btn"
          [title]="isDark() ? 'Light text' : 'Dark text'"
          (press)="toggleStyle()"
          [color]="accent"
        />
      </view>
    </view>
    <!-- Android-only window flags. PASS: the strip changes and the app stays rendered -->
    @if (isAndroid) {
      <view class="row">
        <view class="flex-1">
          <ActionButton
            testID="angular-status-bar-bg-btn"
            [title]="isRed() ? 'BG default' : 'BG red'"
            (press)="toggleRed()"
            [color]="accent"
          />
        </view>
        <view class="flex-1">
          <ActionButton
            testID="angular-status-bar-translucent-btn"
            [title]="isTranslucent() ? 'Opaque' : 'Translucent'"
            (press)="toggleTranslucent()"
            [color]="accent"
          />
        </view>
      </view>
    }
  `,
})
export class CanaryStatusBar {
  readonly accent = ACCENT;
  readonly isAndroid = Platform.OS === 'android';

  readonly isHidden = signal(false);
  readonly isDark = signal(false);
  readonly isRed = signal(false);
  readonly isTranslucent = signal(false);

  toggleHidden(): void {
    this.isHidden.update(value => !value);
    StatusBar.setHidden(this.isHidden(), FADE);
  }

  toggleStyle(): void {
    this.isDark.update(value => !value);
    StatusBar.setBarStyle(
      this.isDark() ? 'dark-content' : 'light-content',
      true,
    );
  }

  toggleRed(): void {
    this.isRed.update(value => !value);
    StatusBar.setBackgroundColor(this.isRed() ? BAR_RED : BAR_DEFAULT, true);
  }

  toggleTranslucent(): void {
    this.isTranslucent.update(value => !value);
    StatusBar.setTranslucent(this.isTranslucent());
  }
}

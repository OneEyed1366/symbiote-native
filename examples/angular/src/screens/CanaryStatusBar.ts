import { Component, signal } from '@angular/core';
import {
  Platform,
  StatusBar,
  SYMBIOTE_ELEMENTS,
} from '@symbiote-native/angular';
import { FlexButton } from './canary-parts';

const BAR_RED = '#dd0031';
const BAR_DEFAULT = '#111827';
const FADE = 'fade';

// JS -> native: the status bar is driven imperatively, watch the top strip react
@Component({
  selector: 'CanaryStatusBar',
  standalone: true,
  imports: [FlexButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="row">
      <FlexButton
        testID="angular-status-bar-hidden-btn"
        [title]="isHidden() ? 'Show status bar' : 'Hide status bar'"
        (press)="toggleHidden()"
      />
      <FlexButton
        testID="angular-status-bar-style-btn"
        [title]="isDark() ? 'Light text' : 'Dark text'"
        (press)="toggleStyle()"
      />
    </view>
    <!-- Android-only window flags. PASS: the strip changes and the app stays rendered -->
    @if (isAndroid) {
      <view class="row">
        <FlexButton
          testID="angular-status-bar-bg-btn"
          [title]="isRed() ? 'BG default' : 'BG red'"
          (press)="toggleRed()"
        />
        <FlexButton
          testID="angular-status-bar-translucent-btn"
          [title]="isTranslucent() ? 'Opaque' : 'Translucent'"
          (press)="toggleTranslucent()"
        />
      </view>
    }
  `,
})
export class CanaryStatusBar {
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

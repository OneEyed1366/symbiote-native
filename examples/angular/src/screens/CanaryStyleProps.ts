import { Component, signal } from '@angular/core';
import {
  KeyboardAvoidingView,
  Platform,
  SYMBIOTE_ELEMENTS,
} from '@symbiote-native/angular';
import { ACCENT, INPUT_HINT, LOGO_URI, TRACK_OFF } from './canary-shared';

const TRACK = { false: TRACK_OFF, true: ACCENT };

// Modern style props reaching Fabric's C++ parser, each an A/B on the dark theme
@Component({
  selector: 'CanaryStyleProps',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="shadow-card">
      <text class="note-text">boxShadow · blue glow</text>
    </view>
    <view class="row">
      <view class="filter-tile">
        <text class="tile-text">no filter</text>
      </view>
      <view class="filter-tile filter-tile-dim">
        <text class="tile-text">brightness 0.5</text>
      </view>
    </view>
    <view class="rotated-card">
      <text class="tile-text">transformOrigin · top-left</text>
    </view>
    <!-- The gradient is authored in App.css and reaches Fabric through the css-parser -->
    <view class="gradient-card">
      <text class="tile-text">background-image · linear-gradient</text>
    </view>
    <!-- PASS: the logo loads through the web alias fold and reads as "Angular logo" -->
    <image
      testID="angular-image"
      [src]="logoUri"
      alt="Angular logo"
      [width]="48"
      [height]="48"
      class="web-image"
    ></image>
  `,
})
export class CanaryStyleProps {
  readonly logoUri = LOGO_URI;
}

// PASS: with avoiding on, focusing the field lifts it above the email keyboard
@Component({
  selector: 'CanaryKeyboardAvoiding',
  standalone: true,
  imports: [KeyboardAvoidingView, SYMBIOTE_ELEMENTS],
  template: `
    <view class="switch-row">
      <text class="switch-label">avoid keyboard</text>
      <switch
        testID="angular-kav-switch"
        [(value)]="isEnabled"
        [trackColor]="track"
      />
    </view>
    <KeyboardAvoidingView [behavior]="behavior" [enabled]="isEnabled()">
      <text-input
        testID="angular-email-input"
        autoComplete="email"
        inputMode="email"
        enterKeyHint="done"
        placeholder="email — focus me near the bottom…"
        [placeholderTextColor]="inputHint"
        class="text-input"
      />
    </KeyboardAvoidingView>
  `,
})
export class CanaryKeyboardAvoiding {
  readonly track = TRACK;
  readonly inputHint = INPUT_HINT;
  readonly behavior = Platform.OS === 'ios' ? 'padding' : 'height';
  readonly isEnabled = signal(true);
}

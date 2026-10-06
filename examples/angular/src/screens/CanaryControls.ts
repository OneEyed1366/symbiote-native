import { Component, computed, input, output, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { Slider } from '@symbiote-native/slider/angular';
import { ACCENT, INPUT_HINT, TRACK_OFF } from './canary-shared';

const TRACK = { false: TRACK_OFF, true: ACCENT };

@Component({
  selector: 'CanaryCounter',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <pressable
      testID="angular-counter-card"
      class="counter-card"
      (press)="tap.emit()"
    >
      <text testID="angular-counter-value" class="counter-text"
        >tapped {{ count() }}×</text
      >
    </pressable>
  `,
})
export class CanaryCounter {
  readonly count = input.required<number>();
  readonly tap = output();
}

// The switch drives the ActivityIndicator, the checkbox is built in and needs no native module
@Component({
  selector: 'CanaryControls',
  standalone: true,
  imports: [Slider, SYMBIOTE_ELEMENTS],
  template: `
    <text-input
      testID="angular-greeting-input"
      [(value)]="name"
      placeholder="type your name…"
      [placeholderTextColor]="inputHint"
      class="text-input"
    ></text-input>
    <text testID="angular-greeting-output" class="greeting">{{
      greeting()
    }}</text>

    <view testID="angular-switch-row" class="switch-row">
      <text class="switch-label">spinner</text>
      <switch
        testID="angular-spinner-switch"
        [(value)]="isSpinning"
        [trackColor]="track"
        thumbColor="#ffffff"
      ></switch>
    </view>
    <activity-indicator
      testID="angular-spinner-indicator"
      [animating]="isSpinning()"
      [color]="accent"
      size="large"
    ></activity-indicator>

    <view testID="angular-checkbox-row" class="switch-row">
      <text class="switch-label">{{ checkboxLabel() }}</text>
      <checkbox
        testID="angular-canary-checkbox"
        [value]="isChecked()"
        [onValueChange]="onCheckboxChange"
        [color]="accent"
      ></checkbox>
    </view>

    <view testID="angular-native-row" class="native-row">
      <activity-indicator
        testID="angular-small-spinner"
        [animating]="true"
        [color]="accent"
        size="small"
        [hidesWhenStopped]="true"
        class="spinner"
      ></activity-indicator>
      <text class="native-row-text"
        >host intrinsics exported from @symbiote-native/angular</text
      >
    </view>

    <view class="section-tight">
      <text class="switch-label">volume · {{ volumePercent() }}%</text>
      <Slider
        testID="angular-volume-slider"
        [(value)]="volume"
        [minimumValue]="0"
        [maximumValue]="1"
        [step]="0.01"
        [minimumTrackTintColor]="accent"
        [maximumTrackTintColor]="trackOff"
        thumbTintColor="#ffffff"
        class="slider"
      />
    </view>
  `,
})
export class CanaryControls {
  readonly accent = ACCENT;
  readonly trackOff = TRACK_OFF;
  readonly inputHint = INPUT_HINT;
  readonly track = TRACK;

  readonly name = signal('');
  readonly isSpinning = signal(true);
  readonly isChecked = signal(false);
  readonly volume = signal(0.5);
  readonly greeting = computed(() =>
    this.name() ? `Hello, ${this.name()}` : 'Hello, stranger',
  );
  readonly checkboxLabel = computed(() =>
    this.isChecked() ? 'checkbox · checked' : 'checkbox · unchecked',
  );
  readonly volumePercent = computed(() => Math.round(this.volume() * 100));

  readonly onCheckboxChange = (event: { value: boolean }): void =>
    this.isChecked.set(event.value);
}

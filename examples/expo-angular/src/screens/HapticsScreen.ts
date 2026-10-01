import { Component, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from '@symbiote-native/haptics/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const ANDROID_OS = 'android';

const IMPACT_STYLES: readonly { label: string; style: ImpactFeedbackStyle }[] =
  [
    { label: 'Light', style: ImpactFeedbackStyle.Light },
    { label: 'Medium', style: ImpactFeedbackStyle.Medium },
    { label: 'Heavy', style: ImpactFeedbackStyle.Heavy },
    { label: 'Rigid', style: ImpactFeedbackStyle.Rigid },
    { label: 'Soft', style: ImpactFeedbackStyle.Soft },
  ];

const NOTIFICATION_TYPES: readonly {
  label: string;
  type: NotificationFeedbackType;
}[] = [
  { label: 'Success', type: NotificationFeedbackType.Success },
  { label: 'Warning', type: NotificationFeedbackType.Warning },
  { label: 'Error', type: NotificationFeedbackType.Error },
];

const ANDROID_HAPTICS: readonly { label: string; type: AndroidHaptics }[] = [
  { label: 'Confirm', type: AndroidHaptics.Confirm },
  { label: 'Reject', type: AndroidHaptics.Reject },
  { label: 'Gesture start', type: AndroidHaptics.Gesture_Start },
  { label: 'Gesture end', type: AndroidHaptics.Gesture_End },
  { label: 'Toggle on', type: AndroidHaptics.Toggle_On },
  { label: 'Toggle off', type: AndroidHaptics.Toggle_Off },
  { label: 'Clock tick', type: AndroidHaptics.Clock_Tick },
  { label: 'Context click', type: AndroidHaptics.Context_Click },
  { label: 'Drag start', type: AndroidHaptics.Drag_Start },
  { label: 'Keyboard tap', type: AndroidHaptics.Keyboard_Tap },
  { label: 'Keyboard press', type: AndroidHaptics.Keyboard_Press },
  { label: 'Keyboard release', type: AndroidHaptics.Keyboard_Release },
  { label: 'Long press', type: AndroidHaptics.Long_Press },
  { label: 'Virtual key', type: AndroidHaptics.Virtual_Key },
  { label: 'Virtual key release', type: AndroidHaptics.Virtual_Key_Release },
  { label: 'No haptics', type: AndroidHaptics.No_Haptics },
  { label: 'Segment tick', type: AndroidHaptics.Segment_Tick },
  {
    label: 'Segment frequent tick',
    type: AndroidHaptics.Segment_Frequent_Tick,
  },
  { label: 'Text handle move', type: AndroidHaptics.Text_Handle_Move },
];

@Component({
  selector: 'HapticsScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="haptics-scroll"
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
            <text class="hero-title">Haptics</text>
            <text class="hero-body">
              Add a tactile feel to the app: taps, success and error buzzes and
              selection ticks through iOS's Taptic Engine and Android's
              vibrator. A simulator cannot vibrate, use a real device.
            </text>
          </view>
        </view>

        <Scenario
          testID="haptics-scenario"
          title="Confirm a tap, a success or an error by feel"
          why="A light tap on a button, a double buzz for success and a sharp one for an error make the app feel physical and let users act without looking."
          [steps]="scenarioSteps"
          expect="Each press vibrates differently on a real phone, and the last fired row names the call that reached the native module."
        />

        <view testID="haptics-impact-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Impact</text>
          </view>
          <view class="button-row">
            @for (item of impactStyles; track item.label) {
              <ActionButton
                [testID]="'haptics-impact-' + item.label.toLowerCase()"
                [title]="item.label"
                [color]="lineColor"
                (press)="impact(item.style, item.label)"
              />
            }
          </view>
        </view>

        <view testID="haptics-notification-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Notification</text>
          </view>
          <view class="button-row">
            @for (item of notificationTypes; track item.label) {
              <ActionButton
                [testID]="'haptics-notification-' + item.label.toLowerCase()"
                [title]="item.label"
                [color]="lineColor"
                (press)="notify(item.type, item.label)"
              />
            }
          </view>
        </view>

        <view testID="haptics-selection-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Selection</text>
          </view>
          <ActionButton
            testID="haptics-selection-button"
            title="Selection"
            [color]="lineColor"
            (press)="select()"
          />
        </view>

        @if (isAndroid) {
          <view testID="haptics-android-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Android haptics</text>
            </view>
            <text class="info-text">
              performAndroidHapticsAsync() drives the device haptics engine
              directly — Android only.
            </text>
            <view class="button-row">
              @for (item of androidHaptics; track item.type) {
                <ActionButton
                  [testID]="'haptics-android-' + item.type"
                  [title]="item.label"
                  [color]="lineColor"
                  (press)="androidHaptic(item.type, item.label)"
                />
              }
            </view>
          </view>
        }

        @if (lastFired(); as fired) {
          <view testID="haptics-last-fired" class="feature-card">
            <text class="value-text">Last fired: {{ fired }}</text>
          </view>
        }
      </scroll-view>
    </safe-area-view>
  `,
})
export class HapticsScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Haptics];
  readonly lineColor = LINE_COLOR.haptics;
  readonly badgeStyle = { backgroundColor: LINE_COLOR.haptics };
  readonly isAndroid = Platform.OS === ANDROID_OS;
  readonly impactStyles = IMPACT_STYLES;
  readonly notificationTypes = NOTIFICATION_TYPES;
  readonly androidHaptics = ANDROID_HAPTICS;
  readonly scenarioSteps = [
    'Press the impact buttons from light to heavy',
    'Press the notification buttons',
    'Press selection while scrolling a picker-like list',
  ];

  readonly lastFired = signal<string | null>(null);

  impact(style: ImpactFeedbackStyle, label: string): void {
    void impactAsync(style);
    this.lastFired.set(`impactAsync(${label})`);
  }

  notify(type: NotificationFeedbackType, label: string): void {
    void notificationAsync(type);
    this.lastFired.set(`notificationAsync(${label})`);
  }

  select(): void {
    void selectionAsync();
    this.lastFired.set('selectionAsync()');
  }

  androidHaptic(type: AndroidHaptics, label: string): void {
    void performAndroidHapticsAsync(type);
    this.lastFired.set(`performAndroidHapticsAsync(${label})`);
  }
}

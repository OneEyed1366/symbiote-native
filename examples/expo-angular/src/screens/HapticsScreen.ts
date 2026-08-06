import { Component, signal } from '@angular/core';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from '@symbiote-native/haptics';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type IImpactOption = { style: ImpactFeedbackStyle; label: string };
type INotificationOption = { type: NotificationFeedbackType; label: string };
type IAndroidHapticOption = { effect: AndroidHaptics; label: string };

const IMPACT_OPTIONS: readonly IImpactOption[] = [
  { style: ImpactFeedbackStyle.Light, label: 'Light' },
  { style: ImpactFeedbackStyle.Medium, label: 'Medium' },
  { style: ImpactFeedbackStyle.Heavy, label: 'Heavy' },
  { style: ImpactFeedbackStyle.Rigid, label: 'Rigid' },
  { style: ImpactFeedbackStyle.Soft, label: 'Soft' },
];

const NOTIFICATION_OPTIONS: readonly INotificationOption[] = [
  { type: NotificationFeedbackType.Success, label: 'Success' },
  { type: NotificationFeedbackType.Warning, label: 'Warning' },
  { type: NotificationFeedbackType.Error, label: 'Error' },
];

// AndroidHaptics mirrors Android's own HapticFeedbackConstants — every value performAndroidHapticsAsync
// accepts, driving the device haptics engine directly rather than expo-haptics' Vibrator simulation.
const ANDROID_HAPTIC_OPTIONS: readonly IAndroidHapticOption[] = [
  { effect: AndroidHaptics.Confirm, label: 'Confirm' },
  { effect: AndroidHaptics.Reject, label: 'Reject' },
  { effect: AndroidHaptics.Gesture_Start, label: 'Gesture start' },
  { effect: AndroidHaptics.Gesture_End, label: 'Gesture end' },
  { effect: AndroidHaptics.Toggle_On, label: 'Toggle on' },
  { effect: AndroidHaptics.Toggle_Off, label: 'Toggle off' },
  { effect: AndroidHaptics.Clock_Tick, label: 'Clock tick' },
  { effect: AndroidHaptics.Context_Click, label: 'Context click' },
  { effect: AndroidHaptics.Drag_Start, label: 'Drag start' },
  { effect: AndroidHaptics.Keyboard_Tap, label: 'Keyboard tap' },
  { effect: AndroidHaptics.Keyboard_Press, label: 'Keyboard press' },
  { effect: AndroidHaptics.Keyboard_Release, label: 'Keyboard release' },
  { effect: AndroidHaptics.Long_Press, label: 'Long press' },
  { effect: AndroidHaptics.Virtual_Key, label: 'Virtual key' },
  { effect: AndroidHaptics.Virtual_Key_Release, label: 'Virtual key release' },
  { effect: AndroidHaptics.No_Haptics, label: 'No haptics' },
  { effect: AndroidHaptics.Segment_Tick, label: 'Segment tick' },
  { effect: AndroidHaptics.Segment_Frequent_Tick, label: 'Segment frequent tick' },
  { effect: AndroidHaptics.Text_Handle_Move, label: 'Text handle move' },
];

/**
 * @symbiote-native/haptics canary demo: one button per ImpactFeedbackStyle/NotificationFeedbackType,
 * a selectionAsync() button, and — Android only — the full AndroidHaptics effect list via
 * performAndroidHapticsAsync. Every call is fire-and-forget (mirrors App.ts's `hide()` call for
 * splash-screen); the only feedback surfaced in JS is a "last fired" text row, since the real
 * result is felt on a physical device, not observable state. Angular twin of
 * ../../react/screens/HapticsScreen.tsx — plain functions, no per-instance service, same as
 * @symbiote-native/local-auth's Angular usage in this app.
 */
@Component({
  selector: 'HapticsScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="haptics-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Haptics</Text>
            <Text class="hero-body">
              @symbiote-native/haptics — impact, notification, and selection feedback via iOS's
              Taptic Engine and Android's Vibrator/haptics APIs. A simulator plays no physical
              feedback; a real device is needed to feel it.
            </Text>
          </View>
        </View>

        <View testID="haptics-impact-card" class="capability-card">
          <Text class="capability-card-title">Impact feedback</Text>
          <View class="button-row">
            @for (item of impactOptions; track item.style) {
              <ActionButton
                [testID]="'haptics-impact-button-' + item.style"
                [title]="item.label"
                (press)="handleImpact(item)"
                [color]="lineColor"
              ></ActionButton>
            }
          </View>
        </View>

        <View testID="haptics-notification-card" class="capability-card">
          <Text class="capability-card-title">Notification feedback</Text>
          <View class="button-row">
            @for (item of notificationOptions; track item.type) {
              <ActionButton
                [testID]="'haptics-notification-button-' + item.type"
                [title]="item.label"
                (press)="handleNotification(item)"
                [color]="lineColor"
              ></ActionButton>
            }
          </View>
        </View>

        <View testID="haptics-selection-card" class="capability-card">
          <Text class="capability-card-title">Selection</Text>
          <View class="button-row">
            <ActionButton
              testID="haptics-selection-button"
              title="Selection"
              (press)="handleSelection()"
              [color]="lineColor"
            ></ActionButton>
          </View>
        </View>

        @if (Platform.OS === 'android') {
          <View testID="haptics-android-card" class="capability-card">
            <Text class="capability-card-title">Android haptics</Text>
            <View class="button-row">
              @for (item of androidHapticOptions; track item.effect) {
                <ActionButton
                  [testID]="'haptics-android-button-' + item.effect"
                  [title]="item.label"
                  (press)="handleAndroidHaptics(item)"
                  [color]="lineColor"
                ></ActionButton>
              }
            </View>
          </View>
        }

        @if (lastFired(); as fired) {
          <Text testID="haptics-last-fired" class="value-text">{{ 'Last fired: ' + fired }}</Text>
        }
      </ScrollView>
    </SafeAreaView>
  `,
})
export class HapticsScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Haptics];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;

  readonly impactOptions = IMPACT_OPTIONS;
  readonly notificationOptions = NOTIFICATION_OPTIONS;
  readonly androidHapticOptions = ANDROID_HAPTIC_OPTIONS;

  readonly lastFired = signal<string | null>(null);

  handleImpact(item: IImpactOption): void {
    impactAsync(item.style);
    this.lastFired.set(`Impact — ${item.label}`);
  }

  handleNotification(item: INotificationOption): void {
    notificationAsync(item.type);
    this.lastFired.set(`Notification — ${item.label}`);
  }

  handleSelection(): void {
    selectionAsync();
    this.lastFired.set('Selection');
  }

  handleAndroidHaptics(item: IAndroidHapticOption): void {
    performAndroidHapticsAsync(item.effect);
    this.lastFired.set(`Android — ${item.label}`);
  }
}

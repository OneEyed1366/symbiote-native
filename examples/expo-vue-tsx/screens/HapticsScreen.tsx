import { defineComponent, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

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

// Every `AndroidHaptics` member, `performAndroidHapticsAsync` does nothing on iOS
// so the whole card renders on Android only
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

export const HapticsScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Haptics];
    const lineColor = LINE_COLOR[lineInfo.line];

    const lastFired = ref<string | null>(null);

    const handleImpact = (style: ImpactFeedbackStyle, label: string) => {
      impactAsync(style);
      lastFired.value = `impactAsync(${label})`;
    };

    const handleNotification = (
      type: NotificationFeedbackType,
      label: string,
    ) => {
      notificationAsync(type);
      lastFired.value = `notificationAsync(${label})`;
    };

    const handleSelection = () => {
      selectionAsync();
      lastFired.value = 'selectionAsync()';
    };

    const handleAndroidHaptic = (type: AndroidHaptics, label: string) => {
      performAndroidHapticsAsync(type);
      lastFired.value = `performAndroidHapticsAsync(${label})`;
    };

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="haptics-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
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
            steps={['Press the impact buttons from light to heavy', 'Press the notification buttons', 'Press selection while scrolling a picker-like list']}
            expect="Each press vibrates differently on a real phone, and the last fired row names the call that reached the native module."
          />

          <view testID="haptics-impact-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Impact</text>
            </view>
            <view class="button-row">
              {IMPACT_STYLES.map(({ label, style }) => (
                <ActionButton
                  key={label}
                  testID={`haptics-impact-${label.toLowerCase()}`}
                  title={label}
                  onPress={() => handleImpact(style, label)}
                  color={lineColor}
                />
              ))}
            </view>
          </view>

          <view testID="haptics-notification-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Notification</text>
            </view>
            <view class="button-row">
              {NOTIFICATION_TYPES.map(({ label, type }) => (
                <ActionButton
                  key={label}
                  testID={`haptics-notification-${label.toLowerCase()}`}
                  title={label}
                  onPress={() => handleNotification(type, label)}
                  color={lineColor}
                />
              ))}
            </view>
          </view>

          <view testID="haptics-selection-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Selection</text>
            </view>
            <ActionButton
              testID="haptics-selection-button"
              title="Selection"
              onPress={handleSelection}
              color={lineColor}
            />
          </view>

          {Platform.OS === 'android' && (
            <view testID="haptics-android-card" class="feature-card">
              <view class="feature-card-header">
                <text class="feature-card-title">Android haptics</text>
              </view>
              <text class="info-text">
                performAndroidHapticsAsync() drives the device haptics engine
                directly — Android only.
              </text>
              <view class="button-row">
                {ANDROID_HAPTICS.map(({ label, type }) => (
                  <ActionButton
                    key={type}
                    testID={`haptics-android-${type}`}
                    title={label}
                    onPress={() => handleAndroidHaptic(type, label)}
                    color={lineColor}
                  />
                ))}
              </view>
            </view>
          )}

          {lastFired.value !== null && (
            <view testID="haptics-last-fired" class="feature-card">
              <text class="value-text">{`Last fired: ${lastFired.value}`}</text>
            </view>
          )}
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'HapticsScreen' },
);

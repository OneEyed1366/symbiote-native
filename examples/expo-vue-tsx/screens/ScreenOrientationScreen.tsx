import { defineComponent } from 'vue';
import {} from '@symbiote-native/vue';
import {
  Orientation,
  OrientationLock,
  lockAsync,
  unlockAsync,
  useScreenOrientation,
} from '@symbiote-native/screen-orientation/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const ORIENTATION_LABEL: Record<Orientation, string> = {
  [Orientation.UNKNOWN]: 'Unknown',
  [Orientation.PORTRAIT_UP]: 'Portrait up',
  [Orientation.PORTRAIT_DOWN]: 'Portrait down',
  [Orientation.LANDSCAPE_LEFT]: 'Landscape left',
  [Orientation.LANDSCAPE_RIGHT]: 'Landscape right',
};

const ORIENTATION_LOCK_LABEL: Record<OrientationLock, string> = {
  [OrientationLock.DEFAULT]: 'Default',
  [OrientationLock.ALL]: 'All',
  [OrientationLock.PORTRAIT]: 'Portrait',
  [OrientationLock.PORTRAIT_UP]: 'Portrait up',
  [OrientationLock.PORTRAIT_DOWN]: 'Portrait down',
  [OrientationLock.LANDSCAPE]: 'Landscape',
  [OrientationLock.LANDSCAPE_LEFT]: 'Landscape left',
  [OrientationLock.LANDSCAPE_RIGHT]: 'Landscape right',
  [OrientationLock.OTHER]: 'Other',
  [OrientationLock.UNKNOWN]: 'Unknown',
};

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * Screen Orientation demo: @symbiote-native/screen-orientation/vue's useScreenOrientation
 * composable seeds current orientation/lock and subscribes to live changes; the three buttons
 * exercise the imperative lockAsync/unlockAsync core functions directly.
 */
export const ScreenOrientationScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation];
    const lineColor =
      LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation].line];

    const screenOrientation = useScreenOrientation();

    function handleLockPortrait() {
      lockAsync(OrientationLock.PORTRAIT_UP);
    }

    function handleLockLandscape() {
      lockAsync(OrientationLock.LANDSCAPE);
    }

    function handleUnlock() {
      unlockAsync();
    }

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="screen-orientation-scroll"
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
              <text class="hero-title">Screen Orientation</text>
              <text class="hero-body">
                @symbiote-native/screen-orientation — live orientation state
                plus lock/unlock controls.
              </text>
            </view>
          </view>

          <view testID="screen-orientation-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Current state</text>
            </view>
            <ValueRow
              label="Orientation"
              value={ORIENTATION_LABEL[screenOrientation.value.orientation]}
            />
            <ValueRow
              label="Orientation lock"
              value={
                ORIENTATION_LOCK_LABEL[screenOrientation.value.orientationLock]
              }
            />
          </view>

          <view testID="screen-orientation-actions-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Lock controls</text>
            </view>
            <ActionButton
              testID="screen-orientation-lock-portrait-button"
              title="Lock portrait"
              onPress={handleLockPortrait}
              color={lineColor}
            />
            <ActionButton
              testID="screen-orientation-lock-landscape-button"
              title="Lock landscape"
              onPress={handleLockLandscape}
              color={lineColor}
            />
            <ActionButton
              testID="screen-orientation-unlock-button"
              title="Unlock"
              onPress={handleUnlock}
              color={lineColor}
            />
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'ScreenOrientationScreen' },
);

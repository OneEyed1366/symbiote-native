import { useCallback } from 'react';
import {
  Orientation,
  OrientationLock,
  lockAsync,
  unlockAsync,
  useScreenOrientation,
} from '@symbiote-native/screen-orientation/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

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

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

export function ScreenOrientationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation];
  const lineColor = LINE_COLOR[lineInfo.line];
  const { orientation, orientationLock } = useScreenOrientation();

  const handleLockPortrait = useCallback(() => {
    lockAsync(OrientationLock.PORTRAIT_UP);
  }, []);

  const handleLockLandscape = useCallback(() => {
    lockAsync(OrientationLock.LANDSCAPE_LEFT);
  }, []);

  const handleUnlock = useCallback(() => {
    unlockAsync();
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="screen-orientation-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Screen Orientation</text>
            <text className="hero-body">
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
          steps={['Press Lock landscape and turn the phone', 'Press Lock portrait', 'Press Unlock and turn the phone again']}
          expect="The screen stays in the locked orientation however you hold the phone, and rotates freely again after Unlock. The state card shows both values."
        />
        <view testID="screen-orientation-state-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Current state</text>
          </view>
          <ValueRow label="Orientation" value={orientationLabel(orientation)} />
          <ValueRow
            label="Orientation lock"
            value={orientationLockLabel(orientationLock)}
          />
        </view>

        <view testID="screen-orientation-actions-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Actions</text>
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
}

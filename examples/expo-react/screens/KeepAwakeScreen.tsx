import { useEffect, useState } from 'react';
import {
  isAvailableAsync,
  useKeepAwake,
} from '@symbiote-native/keep-awake/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

// useKeepAwake() has no on/off param — it activates for as long as the calling component is
// mounted and deactivates on unmount. Mounting/unmounting THIS child is what turns the lock on
// and off, mirroring upstream's own "call the hook only while you want the screen awake" idiom.
function KeepAwakeHolder() {
  useKeepAwake();
  return null;
}

/**
 * @symbiote-native/keep-awake canary demo: a toggle whose "on" state mounts KeepAwakeHolder,
 * activating the keep-awake lock; toggling off unmounts it, deactivating the lock. Plus a
 * capability row for isAvailableAsync().
 */
export function KeepAwakeScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isKeepAwakeOn, setIsKeepAwakeOn] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    isAvailableAsync().then(setIsAvailable);
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="keep-awake-scroll"
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
            <text className="hero-title">Keep Awake</text>
            <text className="hero-body">
              @symbiote-native/keep-awake — keeps the screen on for the lifetime
              of a mounted component.
            </text>
          </view>
        </view>

        <view testID="keep-awake-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Keep screen awake</text>
          </view>
          <ValueRow
            label="Available"
            value={
              isAvailable === null ? 'checking…' : isAvailable ? 'Yes' : 'No'
            }
          />
          <view testID="keep-awake-toggle-row" className="capability-row">
            <text className="capability-label">Keep screen awake</text>
            <switch
              testID="keep-awake-switch"
              value={isKeepAwakeOn}
              onValueChange={event => setIsKeepAwakeOn(event.value)}
              trackColor={{ true: lineColor }}
            />
          </view>
          {isKeepAwakeOn && <KeepAwakeHolder />}
        </view>
      </scroll-view>
    </safe-area-view>
  );
}

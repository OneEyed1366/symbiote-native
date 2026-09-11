import { useCallback, useEffect, useState } from 'react';
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const PRESET_RED = '#ef4444';
const PRESET_BLUE = '#3b82f6';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

/**
 * @symbiote-native/system-ui canary demo: reads the root view's background color on mount, then
 * a preset-color card that calls setBackgroundColorAsync and re-fetches the value afterward so
 * the displayed row always reflects what the native module actually reports.
 */
export function SystemUiScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [backgroundColor, setBackgroundColorValue] = useState<string | null>(
    null,
  );

  const refresh = useCallback(() => {
    getBackgroundColorAsync().then(color => {
      setBackgroundColorValue(color === null ? null : String(color));
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const applyColor = useCallback(
    (color: string | null) => {
      setBackgroundColorAsync(color).then(refresh);
    },
    [refresh],
  );

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="system-ui-scroll"
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
            <text className="hero-title">System UI</text>
            <text className="hero-body">
              @symbiote-native/system-ui — get/set the root view's background
              color.
            </text>
          </view>
        </view>

        <view testID="system-ui-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Root view background</text>
          </view>
          <ValueRow
            label="Current color"
            value={backgroundColor ?? 'not set'}
          />
          <ActionButton
            testID="system-ui-red-button"
            title="Red"
            onPress={() => applyColor(PRESET_RED)}
            color={lineColor}
          />
          <ActionButton
            testID="system-ui-blue-button"
            title="Blue"
            onPress={() => applyColor(PRESET_BLUE)}
            color={lineColor}
          />
          <ActionButton
            testID="system-ui-reset-button"
            title="Reset"
            onPress={() => applyColor(null)}
            color={lineColor}
          />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}

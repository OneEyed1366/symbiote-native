import { createSignal } from 'solid-js';
import { ScrollView } from '@symbiote-native/solid';
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const PRESET_RED = '#ef4444';
const PRESET_BLUE = '#3b82f6';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
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

  const [backgroundColor, setBackgroundColorValue] = createSignal<
    string | null
  >(null);

  const refresh = () => {
    getBackgroundColorAsync().then(color => {
      setBackgroundColorValue(color === null ? null : String(color));
    });
  };

  refresh();

  const applyColor = (color: string | null) => {
    setBackgroundColorAsync(color).then(refresh);
  };

  return (
    <safe-area-view class="screen">
      <ScrollView
        testID="system-ui-scroll"
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
            <text class="hero-title">System UI</text>
            <text class="hero-body">
              @symbiote-native/system-ui — get/set the root view's background
              color.
            </text>
          </view>
        </view>

        <view testID="system-ui-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Root view background</text>
          </view>
          <ValueRow
            label="Current color"
            value={backgroundColor() ?? 'not set'}
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
      </ScrollView>
    </safe-area-view>
  );
}

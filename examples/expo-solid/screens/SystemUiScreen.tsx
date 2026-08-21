import { createSignal } from 'solid-js';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
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
    <View class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <Text class="value-text">{props.value}</Text>
    </View>
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

  const [backgroundColor, setBackgroundColorValue] = createSignal<string | null>(
    null,
  );

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
    <SafeAreaView class="screen">
      <ScrollView
        testID="system-ui-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">System UI</Text>
            <Text class="hero-body">
              @symbiote-native/system-ui — get/set the root view's background
              color.
            </Text>
          </View>
        </View>

        <View testID="system-ui-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Root view background</Text>
          </View>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

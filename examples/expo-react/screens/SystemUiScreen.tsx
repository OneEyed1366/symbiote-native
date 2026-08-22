import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
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
    <View className="capability-row">
      <Text className="capability-label">{label}</Text>
      <Text className="value-text">{value}</Text>
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
    <SafeAreaView className="screen">
      <ScrollView
        testID="system-ui-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">System UI</Text>
            <Text className="hero-body">
              @symbiote-native/system-ui — get/set the root view's background
              color.
            </Text>
          </View>
        </View>

        <View testID="system-ui-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Root view background</Text>
          </View>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

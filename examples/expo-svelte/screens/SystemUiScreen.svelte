<script lang="ts">
  import {
    getBackgroundColorAsync,
    setBackgroundColorAsync,
  } from '@symbiote-native/system-ui/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const PRESET_RED = '#ef4444';
  const PRESET_BLUE = '#3b82f6';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
  const lineColor = LINE_COLOR[lineInfo.line];

  let backgroundColor = $state<string | null>(null);

  async function refresh(): Promise<void> {
    const color = await getBackgroundColorAsync();
    backgroundColor = color === null ? null : String(color);
  }

  function applyColor(color: string | null): void {
    void setBackgroundColorAsync(color).then(refresh);
  }

  // The first read happens after an await, so the dependency set is empty and this runs once
  $effect(() => {
    void refresh();
  });
</script>

<safe-area-view class="screen">
  <scroll-view
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
          Set the color of the window behind your app, so keyboard animations,
          overscroll and screen transitions do not flash white against a dark
          theme.
        </text>
      </view>
    </view>

    <Scenario
      testID="system-ui-scenario"
      title="Match the window background to the app theme"
      why="The root view shows through during overscroll, rotation and keyboard transitions. Setting it to the theme color removes the white flash in dark mode."
      steps={[
        'Press Red or Blue',
        'Overscroll the list or rotate the phone',
        'Press Reset',
      ]}
      expect="The color row shows the new value and the color appears wherever the window shows through. Reset returns the default."
    />

    <view testID="system-ui-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Root view background</text>
      </view>
      <view class="capability-row">
        <text class="capability-label">Current color</text>
        <text class="value-text">{backgroundColor ?? 'not set'}</text>
      </view>
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

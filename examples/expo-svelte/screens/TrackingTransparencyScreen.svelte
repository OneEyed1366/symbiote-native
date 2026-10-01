<script lang="ts">
  import {
    getAdvertisingId,
    useTrackingPermissions,
  } from '@symbiote-native/tracking-transparency/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const PENDING_LABEL = 'checking…';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  // `status` is a getter on the boxed rune, destructuring would freeze it at the initial null
  const permissions = useTrackingPermissions();
  // Synchronous native read, `null` on Android and the iOS simulator
  const advertisingId: string | null = getAdvertisingId();

  const statusText = $derived(permissions.status?.status ?? PENDING_LABEL);
  const grantedText = $derived.by(() => {
    if (permissions.status === null) return PENDING_LABEL;
    return permissions.status.granted ? 'Yes' : 'No';
  });
</script>

{#snippet valueRow(label: string, value: string)}
  <view class="capability-row">
    <text class="capability-label">{label}</text>
    <text class="value-text">{value}</text>
  </view>
{/snippet}

<safe-area-view class="screen">
  <scroll-view
    testID="tracking-transparency-scroll"
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
        <text class="hero-title">Tracking Transparency</text>
        <text class="hero-body">
          Ask permission to track the user across apps before you use the
          advertising id. iOS shows the App Tracking Transparency prompt,
          Android always reports granted.
        </text>
      </view>
    </view>

    <Scenario
      testID="tracking-transparency-scenario"
      title="Ask before using the advertising id"
      why="Apple requires the tracking prompt before an app reads the advertising id for ads or attribution. Without consent the id is empty, so the app must work either way."
      steps={[
        'Press Get to read the current status',
        'Press Request and answer the system prompt',
        'Read the advertising id below',
      ]}
      expect="The status changes to granted or denied after your answer. The id shows a value only after consent on a real iOS device and is null elsewhere."
    />

    <view
      testID="tracking-transparency-permission-card"
      class="feature-card"
    >
      <view class="feature-card-header">
        <text class="feature-card-title">Permission</text>
      </view>
      {@render valueRow('Status', statusText)}
      {@render valueRow('Granted', grantedText)}
      <ActionButton
        testID="tracking-transparency-get-button"
        title="Get"
        onPress={() => permissions.getPermission()}
        color={lineColor}
      />
      <ActionButton
        testID="tracking-transparency-request-button"
        title="Request"
        onPress={() => permissions.requestPermission()}
        color={lineColor}
      />
    </view>

    <view
      testID="tracking-transparency-advertising-id-card"
      class="feature-card"
    >
      <view class="feature-card-header">
        <text class="feature-card-title">Advertising ID</text>
      </view>
      {@render valueRow('Advertising ID', advertisingId ?? 'null')}
    </view>
  </scroll-view>
</safe-area-view>

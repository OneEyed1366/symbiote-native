<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
  import {
    CellularGeneration,
    allowsVoipAsync,
    getCarrierNameAsync,
    getCellularGenerationAsync,
    getIsoCountryCodeAsync,
    getMobileCountryCodeAsync,
    getMobileNetworkCodeAsync,
    usePermissions,
  } from '@symbiote-native/cellular/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const PENDING_LABEL = 'checking…';
  // An empty string is a real answer from the SIM, distinct from null (not read yet)
  const EMPTY_LABEL = '(none)';

  function generationLabel(generation: CellularGeneration): string {
    switch (generation) {
      case CellularGeneration.CELLULAR_2G:
        return '2G';
      case CellularGeneration.CELLULAR_3G:
        return '3G';
      case CellularGeneration.CELLULAR_4G:
        return '4G';
      case CellularGeneration.CELLULAR_5G:
        return '5G';
      case CellularGeneration.UNKNOWN:
      default:
        return 'Unknown';
    }
  }

  function valueLabel(value: string | boolean | null): string {
    if (value === null) return PENDING_LABEL;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return value || EMPTY_LABEL;
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
  const lineColor = LINE_COLOR[lineInfo.line];

  let generation = $state<CellularGeneration | null>(null);
  let allowsVoip = $state<boolean | null>(null);
  let isoCountryCode = $state<string | null>(null);
  let carrierName = $state<string | null>(null);
  let mobileCountryCode = $state<string | null>(null);
  let mobileNetworkCode = $state<string | null>(null);
  const permissions = usePermissions();

  // Write-only over the state above, so the dependency set stays empty and this runs once on mount
  $effect(() => {
    void Promise.all([
      getCellularGenerationAsync(),
      allowsVoipAsync(),
      getIsoCountryCodeAsync(),
      getCarrierNameAsync(),
      getMobileCountryCodeAsync(),
      getMobileNetworkCodeAsync(),
    ]).then(
      ([currentGeneration, voip, iso, carrier, countryCode, networkCode]) => {
        generation = currentGeneration;
        allowsVoip = voip;
        isoCountryCode = iso;
        carrierName = carrier;
        mobileCountryCode = countryCode;
        mobileNetworkCode = networkCode;
      },
    );
  });

  const permissionLabel = $derived(
    permissions.status === null ? PENDING_LABEL : permissions.status.status,
  );
</script>

{#snippet infoRow(label: string, value: string)}
  <view class="capability-row">
    <text class="capability-label">{label}</text>
    <text class="value-text">{value}</text>
  </view>
{/snippet}

<safe-area-view class="screen">
  <scroll-view
    testID="cellular-scroll"
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
        <text class="hero-title">Cellular</text>
        <text class="hero-body">
          Find out about the mobile connection: network generation (2G to 5G),
          carrier name, country code and whether VoIP is allowed. Only the
          generation works on iOS, a physical device with a SIM is needed.
        </text>
      </view>
    </view>

    <Scenario
      testID="cellular-scenario"
      title="Choose video quality from the mobile network generation"
      why="On 3G, lower the stream quality or skip auto-downloads, on 5G allow them. The carrier and country help pick the right payment or support options."
      steps={[
        'Turn Wi-Fi off so the phone uses mobile data',
        'Read the generation and carrier in the card',
      ]}
      expect="The generation shows 3G, 4G or 5G and the carrier name appears on Android. Fields the platform does not provide show as unavailable."
    />

    <view testID="cellular-info-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Cellular info</text>
      </view>
      {@render infoRow(
        'Generation',
        generation === null ? PENDING_LABEL : generationLabel(generation),
      )}
      {#if Platform.OS === 'android'}
        {@render infoRow('Allows VoIP', valueLabel(allowsVoip))}
        {@render infoRow('ISO country code', valueLabel(isoCountryCode))}
        {@render infoRow('Carrier name', valueLabel(carrierName))}
        {@render infoRow('Mobile country code', valueLabel(mobileCountryCode))}
        {@render infoRow('Mobile network code', valueLabel(mobileNetworkCode))}
      {/if}
    </view>

    <view testID="cellular-permission-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Permission</text>
      </view>
      {@render infoRow('Phone-state permission status', permissionLabel)}
      <ActionButton
        testID="cellular-request-permission"
        title="Request permission"
        onPress={() => permissions.request()}
        color={lineColor}
      />
    </view>
  </scroll-view>
</safe-area-view>

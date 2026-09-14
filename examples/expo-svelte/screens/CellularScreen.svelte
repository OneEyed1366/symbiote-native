<script lang="ts">
  // @symbiote-native/cellular tour stop — a one-shot info card (generation + carrier/SIM fields,
  // every field except generation returns null on iOS/web upstream — Android-only in practice) plus
  // a permission card driving usePermissions(). Most fields need a physical device with a SIM card;
  // a simulator/emulator reports null/UNKNOWN for nearly everything. Svelte twin of
  // examples/expo-vue-sfc/screens/CellularScreen.vue.
  import { Platform, ScrollView } from '@symbiote-native/svelte';
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
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const PENDING_LABEL = 'checking…';
  // An empty string is a real answer from the native side ("the SIM reports no name"), distinct
  // from null ("not read yet"), so it gets its own label instead of falling back to PENDING_LABEL.
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

  // Write-only over the state above, so the dependency set stays empty and this runs exactly once
  // on mount — the twin of the Vue screen's onMounted.
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

  const generationText = $derived(
    generation === null ? PENDING_LABEL : generationLabel(generation),
  );
  const allowsVoipText = $derived(valueLabel(allowsVoip));
  const isoCountryCodeText = $derived(valueLabel(isoCountryCode));
  const carrierNameText = $derived(valueLabel(carrierName));
  const mobileCountryCodeText = $derived(valueLabel(mobileCountryCode));
  const mobileNetworkCodeText = $derived(valueLabel(mobileNetworkCode));
  const permissionLabel = $derived(
    permissions.status === null ? PENDING_LABEL : permissions.status.status,
  );
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="cellular-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Cellular</text>
        <text class="hero-body">
          @symbiote-native/cellular — cellular generation and carrier/SIM info.
          Every field except generation is Android-only upstream (iOS/web return
          null); a physical device with an active SIM is needed for real values.
        </text>
      </view>
    </view>
    <view testID="cellular-info-card" class="cellular-card">
      <text class="cellular-card-title">Cellular info</text>
      <view class="cellular-row">
        <text class="cellular-row-label">Generation</text>
        <text testID="cellular-generation-value" class="cellular-value-text">
          {generationText}
        </text>
      </view>
      {#if Platform.OS === 'android'}<view class="cellular-row">
          <text class="cellular-row-label">Allows VoIP</text>
          <text class="cellular-value-text">{allowsVoipText}</text>
        </view>
        <view class="cellular-row">
          <text class="cellular-row-label">ISO country code</text>
          <text class="cellular-value-text">{isoCountryCodeText}</text>
        </view>
        <view class="cellular-row">
          <text class="cellular-row-label">Carrier name</text>
          <text class="cellular-value-text">{carrierNameText}</text>
        </view>
        <view class="cellular-row">
          <text class="cellular-row-label">Mobile country code</text>
          <text class="cellular-value-text">{mobileCountryCodeText}</text>
        </view>
        <view class="cellular-row">
          <text class="cellular-row-label">Mobile network code</text>
          <text class="cellular-value-text">{mobileNetworkCodeText}</text>
        </view>{/if}
    </view>
    <view testID="cellular-permission-card" class="cellular-card">
      <text class="cellular-card-title">Permission</text>
      <view class="cellular-row">
        <text class="cellular-row-label">Phone-state permission status</text>
        <text testID="cellular-permission-value" class="cellular-value-text">
          {permissionLabel}
        </text>
      </view>
      <ActionButton
        testID="cellular-request-permission"
        title="Request permission"
        onPress={() => permissions.request()}
        color={lineColor}
      />
    </view>
  </ScrollView>
</safe-area-view>

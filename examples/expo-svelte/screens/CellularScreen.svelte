<script lang="ts">
  // @symbiote-native/cellular tour stop — a one-shot info card (generation + carrier/SIM fields,
  // every field except generation returns null on iOS/web upstream — Android-only in practice) plus
  // a permission card driving usePermissions(). Most fields need a physical device with a SIM card;
  // a simulator/emulator reports null/UNKNOWN for nearly everything. Svelte twin of
  // examples/expo-vue-sfc/screens/CellularScreen.vue.
  import {
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
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

<SafeAreaView class="screen">
  <ScrollView
    testID="cellular-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
    </View>
    <View class="hero-card">
      <View class="hero-badge" style={{ backgroundColor: lineColor }}>
        <Text class="hero-badge-text">{lineInfo.code}</Text>
      </View>
      <View class="hero-copy">
        <Text class="hero-title">Cellular</Text>
        <Text class="hero-body">
          @symbiote-native/cellular — cellular generation and carrier/SIM info.
          Every field except generation is Android-only upstream (iOS/web return
          null); a physical device with an active SIM is needed for real values.
        </Text>
      </View>
    </View>
    <View testID="cellular-info-card" class="cellular-card">
      <Text class="cellular-card-title">Cellular info</Text>
      <View class="cellular-row">
        <Text class="cellular-row-label">Generation</Text>
        <Text testID="cellular-generation-value" class="cellular-value-text">
          {generationText}
        </Text>
      </View>{#if Platform.OS === 'android'}<View class="cellular-row">
          <Text class="cellular-row-label">Allows VoIP</Text>
          <Text class="cellular-value-text">{allowsVoipText}</Text>
        </View>
        <View class="cellular-row">
          <Text class="cellular-row-label">ISO country code</Text>
          <Text class="cellular-value-text">{isoCountryCodeText}</Text>
        </View>
        <View class="cellular-row">
          <Text class="cellular-row-label">Carrier name</Text>
          <Text class="cellular-value-text">{carrierNameText}</Text>
        </View>
        <View class="cellular-row">
          <Text class="cellular-row-label">Mobile country code</Text>
          <Text class="cellular-value-text">{mobileCountryCodeText}</Text>
        </View>
        <View class="cellular-row">
          <Text class="cellular-row-label">Mobile network code</Text>
          <Text class="cellular-value-text">{mobileNetworkCodeText}</Text>
        </View>{/if}
    </View>
    <View testID="cellular-permission-card" class="cellular-card">
      <Text class="cellular-card-title">Permission</Text>
      <View class="cellular-row">
        <Text class="cellular-row-label">Phone-state permission status</Text>
        <Text testID="cellular-permission-value" class="cellular-value-text">
          {permissionLabel}
        </Text>
      </View>
      <ActionButton
        testID="cellular-request-permission"
        title="Request permission"
        onPress={() => permissions.request()}
        color={lineColor}
      />
    </View>
  </ScrollView>
</SafeAreaView>

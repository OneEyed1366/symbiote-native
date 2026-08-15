<script lang="ts">
  // @symbiote-native/tracking-transparency tour stop — usePermissions() auto-fetches the current
  // status on mount; get()/request() re-fetch on demand. getAdvertisingId() is a plain synchronous
  // core call that may return null (iOS Simulator, not yet authorized, or declined). Svelte twin
  // of ../../expo-vue-sfc/screens/TrackingTransparencyScreen.vue.
  //
  // Markup formatting is load-bearing: siblings are packed edge-to-edge and every text node stays
  // on ONE source line — see MenuScreen.svelte's header and svelte-adapter-dom-shim §16.
  import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/svelte';
  import { getAdvertisingId, usePermissions } from '@symbiote-native/tracking-transparency/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  // The rune hands back a boxed object whose `status` is a getter — Svelte 5 reactivity is
  // lexically scoped, so destructuring it here would freeze the value at its initial null.
  const permissions = usePermissions();
  let advertisingId = $state<string | null>(getAdvertisingId());

  const statusText = $derived(permissions.status?.status ?? 'checking…');
  const grantedStatus: ICapabilityStatus = $derived.by(() => {
    if (permissions.status === null) return 'checking';
    return permissions.status.granted ? 'yes' : 'no';
  });

  function toBadgeText(status: ICapabilityStatus): string {
    return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  }

  function handleGet(): void {
    void permissions.get();
  }

  function handleRequest(): void {
    void permissions.request().then(() => {
      advertisingId = getAdvertisingId();
    });
  }
</script>

<SafeAreaView class="screen"
  ><ScrollView testID="tracking-transparency-scroll" class="screen" contentContainerStyle="scroll-content"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: lineColor }}
        ><Text class="hero-badge-text">{lineInfo.code}</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">Tracking Transparency</Text><Text class="hero-body">@symbiote-native/tracking-transparency — App Tracking Transparency permission status plus the advertising ID it gates. Android/web always report granted.</Text></View
      ></View
    ><View testID="tracking-transparency-permission-card" class="tracking-transparency-card"
      ><Text class="tracking-transparency-card-title">Permission</Text><View class="tracking-transparency-row"
        ><Text class="tracking-transparency-row-label">Status</Text><Text testID="tracking-transparency-status-value" class="tracking-transparency-value-text">{statusText}</Text></View
      ><View class="tracking-transparency-row"
        ><Text class="tracking-transparency-row-label">Granted</Text><View class={`tracking-transparency-status-badge tracking-transparency-status-badge-${grantedStatus}`}
          ><Text class="tracking-transparency-status-text">{toBadgeText(grantedStatus)}</Text></View
        ></View
      ><View class="button-row"
        ><ActionButton
          testID="tracking-transparency-get-button"
          title="Get"
          onPress={handleGet}
          color={lineColor}
        /><ActionButton
          testID="tracking-transparency-request-button"
          title="Request"
          onPress={handleRequest}
          color={lineColor}
        /></View
      ></View
    ><View testID="tracking-transparency-advertising-id-card" class="tracking-transparency-card"
      ><Text class="tracking-transparency-card-title">Advertising ID</Text><View class="tracking-transparency-result-box"
        ><Text testID="tracking-transparency-advertising-id-value" class="tracking-transparency-result-text">{advertisingId ?? 'null'}</Text></View
      ></View
    ></ScrollView
  ></SafeAreaView
>

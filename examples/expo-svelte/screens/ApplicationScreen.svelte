<script lang="ts">
  // @symbiote-native/application tour stop — an eager-constants card (nativeApplicationVersion/
  // nativeBuildVersion/applicationName/applicationId, resolved once at import time) plus an actions
  // card: getInstallationTimeAsync() on both platforms, then a platform-gated pair (Android:
  // getAndroidId/getInstallReferrerAsync; iOS: getIosIdForVendorAsync/
  // getIosApplicationReleaseTypeAsync). Svelte twin of
  // examples/expo-vue-sfc/screens/ApplicationScreen.vue.
  //
  // Markup packing is load-bearing here, exactly as in MenuScreen.svelte: siblings sit edge-to-edge
  // with zero whitespace between them and every text node stays on ONE source line
  // (svelte-adapter-dom-shim §16 — Svelte turns stray inter-sibling whitespace into a real
  // RCTRawText and never condenses a wrapped sentence).
  import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/svelte';
  import {
    ApplicationReleaseType,
    applicationId,
    applicationName,
    getAndroidId,
    getInstallReferrerAsync,
    getInstallationTimeAsync,
    getIosApplicationReleaseTypeAsync,
    getIosIdForVendorAsync,
    nativeApplicationVersion,
    nativeBuildVersion,
  } from '@symbiote-native/application/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  function applicationReleaseTypeLabel(type: ApplicationReleaseType): string {
    switch (type) {
      case ApplicationReleaseType.SIMULATOR:
        return 'Simulator';
      case ApplicationReleaseType.ENTERPRISE:
        return 'Enterprise';
      case ApplicationReleaseType.DEVELOPMENT:
        return 'Development';
      case ApplicationReleaseType.AD_HOC:
        return 'Ad Hoc';
      case ApplicationReleaseType.APP_STORE:
        return 'App Store';
      default:
        return 'Unknown';
    }
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
  const lineColor = LINE_COLOR[lineInfo.line];

  let installationTimeResult = $state<string | null>(null);
  let androidIdResult = $state<string | null>(null);
  let installReferrerResult = $state<string | null>(null);
  let iosVendorIdResult = $state<string | null>(null);
  let iosReleaseTypeResult = $state<string | null>(null);

  function handleGetInstallationTime(): void {
    void getInstallationTimeAsync().then(value => {
      installationTimeResult = value.toISOString();
    });
  }

  function handleGetAndroidId(): void {
    androidIdResult = getAndroidId();
  }

  function handleGetInstallReferrer(): void {
    void getInstallReferrerAsync().then(value => {
      installReferrerResult = value;
    });
  }

  function handleGetIosIdForVendor(): void {
    void getIosIdForVendorAsync().then(value => {
      iosVendorIdResult = value;
    });
  }

  function handleGetIosReleaseType(): void {
    void getIosApplicationReleaseTypeAsync().then(value => {
      iosReleaseTypeResult = applicationReleaseTypeLabel(value);
    });
  }
</script>

<SafeAreaView class="screen"
  ><ScrollView testID="application-scroll" class="screen" contentContainerStyle="scroll-content"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: lineColor }}
        ><Text class="hero-badge-text">{lineInfo.code}</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">Application</Text><Text class="hero-body">@symbiote-native/application — app version/build/name/ID, install time, the Android ID and install referrer on Android, the vendor ID and release type on iOS.</Text></View
      ></View
    ><View testID="application-info-card" class="application-card"
      ><Text class="application-card-title">Info</Text><View class="application-row"
        ><Text class="application-row-label">Name</Text><Text class="application-value-text">{applicationName ?? 'unknown'}</Text></View
      ><View class="application-row"
        ><Text class="application-row-label">ID</Text><Text class="application-value-text">{applicationId ?? 'unknown'}</Text></View
      ><View class="application-row"
        ><Text class="application-row-label">Version</Text><Text class="application-value-text">{nativeApplicationVersion ?? 'unknown'}</Text></View
      ><View class="application-row"
        ><Text class="application-row-label">Build</Text><Text class="application-value-text">{nativeBuildVersion ?? 'unknown'}</Text></View
      ></View
    ><View testID="application-actions-card" class="application-card"
      ><Text class="application-card-title">Actions</Text><View class="button-row"
        ><ActionButton testID="application-installation-time-button" title="Get Installation Time" onPress={handleGetInstallationTime} color={lineColor} /></View
      >{#if installationTimeResult !== null}<View class="application-row"
        ><Text class="application-row-label">Installed</Text><Text testID="application-installation-time-value" class="application-value-text">{installationTimeResult}</Text></View
      >{/if}{#if Platform.OS === 'android'}<View class="button-row"
        ><ActionButton testID="application-android-id-button" title="Get Android ID" onPress={handleGetAndroidId} color={lineColor} /><ActionButton testID="application-install-referrer-button" title="Get Install Referrer" onPress={handleGetInstallReferrer} color={lineColor} /></View
      >{/if}{#if androidIdResult !== null}<View class="application-row"
        ><Text class="application-row-label">Android ID</Text><Text testID="application-android-id-value" class="application-value-text">{androidIdResult}</Text></View
      >{/if}{#if installReferrerResult !== null}<View class="application-row"
        ><Text class="application-row-label">Install referrer</Text><Text testID="application-install-referrer-value" class="application-value-text">{installReferrerResult}</Text></View
      >{/if}{#if Platform.OS === 'ios'}<View class="button-row"
        ><ActionButton testID="application-ios-vendor-id-button" title="Get iOS ID For Vendor" onPress={handleGetIosIdForVendor} color={lineColor} /><ActionButton testID="application-ios-release-type-button" title="Get iOS Release Type" onPress={handleGetIosReleaseType} color={lineColor} /></View
      >{/if}{#if iosVendorIdResult !== null}<View class="application-row"
        ><Text class="application-row-label">iOS vendor ID</Text><Text testID="application-ios-vendor-id-value" class="application-value-text">{iosVendorIdResult}</Text></View
      >{/if}{#if iosReleaseTypeResult !== null}<View class="application-row"
        ><Text class="application-row-label">iOS release type</Text><Text testID="application-ios-release-type-value" class="application-value-text">{iosReleaseTypeResult}</Text></View
      >{/if}</View
    ></ScrollView
  ></SafeAreaView
>

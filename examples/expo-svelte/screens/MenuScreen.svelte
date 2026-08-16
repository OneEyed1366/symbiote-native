<script lang="ts">
  // Root menu for the Expo-modules-core demo surface: one row per Expo-SDK-ported
  // @symbiote-native package, each pushing its own dedicated demo screen onto the same root Stack.
  // Rows are grouped into thematic "lines" (navigation-lines.ts's ROUTE_LINE_INFO) — a color +
  // 2-letter badge per line, carried through onto each demo screen's own line tag. Svelte twin of
  // examples/expo-vue-sfc/screens/MenuScreen.vue.
  //
  // MARKUP FORMATTING IS LOAD-BEARING here and in every screen of this app: multi-sibling regions
  // are packed edge-to-edge with zero whitespace between siblings, and a text node stays on ONE
  // source line — svelte-adapter-dom-shim skill §16 (a stray space between two sibling tags
  // compiles to a real RCTRawText child, invalid under a non-Text parent on device; a wrapped
  // sentence ships its newline and indent straight into the RCTText).
  import { Pressable, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/svelte';
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { ROUTE_NAME } from '../routes';
  import type { ITourRouteName } from '../navigation-lines';
  import { ROUTE_LINE_INFO } from '../navigation-lines';

  // This screen is only ever mounted under a Stack (see App.svelte's <Screen name={ROUTE_NAME.Menu}>),
  // so useStackNavigation() hands back the Stack-specific handle (push/pop/…) directly — no union
  // narrowing.
  const navigation = useStackNavigation();

  type IMenuItem = {
    label: string;
    route: ITourRouteName;
    hint: string;
  };

  const MENU_ITEMS: readonly IMenuItem[] = [
    { label: 'Sensors', route: ROUTE_NAME.Sensors, hint: 'Accelerometer, Gyroscope, Magnetometer, DeviceMotion, Pedometer' },
    { label: 'Local auth', route: ROUTE_NAME.LocalAuth, hint: '@symbiote-native/local-auth — FaceID/TouchID/fingerprint' },
    { label: 'Haptics', route: ROUTE_NAME.Haptics, hint: '@symbiote-native/haptics — impact/notification/selection vibration feedback' },
    { label: 'Clipboard', route: ROUTE_NAME.Clipboard, hint: '@symbiote-native/clipboard — read/write clipboard text, URLs, and change events' },
    { label: 'Battery', route: ROUTE_NAME.Battery, hint: '@symbiote-native/battery — live battery level, state, and low-power mode' },
    { label: 'Brightness', route: ROUTE_NAME.Brightness, hint: '@symbiote-native/brightness — screen brightness get/set, Android system-brightness mode, permission gating' },
    { label: 'Cellular', route: ROUTE_NAME.Cellular, hint: '@symbiote-native/cellular — cellular generation, carrier/SIM info, permission gating' },
    { label: 'Network', route: ROUTE_NAME.Network, hint: '@symbiote-native/network — live network state, IP address, airplane mode' },
    { label: 'Device', route: ROUTE_NAME.Device, hint: '@symbiote-native/device — device brand/model/OS info, memory, root/jailbreak detection' },
    { label: 'Application', route: ROUTE_NAME.Application, hint: '@symbiote-native/application — app version/build/name/ID, install time, Android ID, iOS vendor ID' },
    { label: 'Crypto', route: ROUTE_NAME.Crypto, hint: '@symbiote-native/crypto — random bytes/UUID, cryptographic digest (SHA-1/256/384/512, MD2/4/5)' },
    { label: 'Web Crypto', route: ROUTE_NAME.StandardWebCrypto, hint: '@symbiote-native/standard-web-crypto — Web Crypto API getRandomValues polyfill' },
    { label: 'System UI', route: ROUTE_NAME.SystemUi, hint: '@symbiote-native/system-ui — root view background color get/set' },
    { label: 'Store Review', route: ROUTE_NAME.StoreReview, hint: '@symbiote-native/store-review — native in-app store review prompt' },
    { label: 'Keep Awake', route: ROUTE_NAME.KeepAwake, hint: '@symbiote-native/keep-awake — keep the screen on while mounted' },
    { label: 'Screen Orientation', route: ROUTE_NAME.ScreenOrientation, hint: '@symbiote-native/screen-orientation — orientation lock/unlock and live orientation state' },
    { label: 'Localization', route: ROUTE_NAME.Localization, hint: '@symbiote-native/localization — device locales and calendar preferences' },
    { label: 'Tracking Transparency', route: ROUTE_NAME.TrackingTransparency, hint: '@symbiote-native/tracking-transparency — iOS App Tracking Transparency prompt and advertising ID' },
    { label: 'Secure Store', route: ROUTE_NAME.SecureStore, hint: '@symbiote-native/secure-store — encrypted key/value storage in the Keychain/Keystore, optionally behind biometrics' },
    { label: 'Sharing', route: ROUTE_NAME.Sharing, hint: '@symbiote-native/sharing — opens the platform share sheet for a local file' },
    { label: 'Web Browser', route: ROUTE_NAME.WebBrowser, hint: '@symbiote-native/web-browser — in-app browser (SFSafariViewController / Custom Tabs) and the OAuth auth session' },
    { label: 'SMS', route: ROUTE_NAME.Sms, hint: '@symbiote-native/sms — opens the system SMS composer prefilled with recipients and a message' },
  ];
</script>

<SafeAreaView class="screen"
  ><ScrollView testID="menu-scroll" class="screen" contentContainerStyle="scroll-content"
    ><View class="menu-hero"
      ><Text class="menu-eyebrow">EXPO MODULES DEMOS</Text><Text class="menu-hero-title">Expo-SDK ports on a real native stack</Text><Text class="menu-hero-subtitle">Each row below demos a different @symbiote-native package built on expo-modules-core.</Text
      ></View
    >{#each MENU_ITEMS as item (item.route)}{@const lineInfo = ROUTE_LINE_INFO[item.route]}<Pressable
      testID={`menu-row-${item.route}`}
      class={`menu-row menu-row-${lineInfo.line}`}
      onPress={() => navigation.current.push(item.route)}
      ><View class={`menu-badge menu-badge-${lineInfo.line}`}
        ><Text class="menu-badge-text">{lineInfo.code}</Text></View
      ><View class="menu-row-copy"
        ><Text class="menu-row-label">{item.label}</Text><Text class={`menu-row-hint menu-row-hint-${lineInfo.line}`}>{item.hint}</Text></View
      ></Pressable
    >{/each}</ScrollView
  ></SafeAreaView
>

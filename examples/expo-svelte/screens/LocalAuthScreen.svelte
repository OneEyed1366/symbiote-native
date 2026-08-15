<script lang="ts">
  // @symbiote-native/local-auth tour stop — a capabilities card (hardware present, enrolled,
  // enrolled security level, supported biometric types) followed by a live authenticateAsync()
  // button. cancelAuthenticate() is Android-only upstream, so the Cancel button only renders
  // there. Svelte twin of ../../expo-vue-sfc/screens/LocalAuthScreen.vue.
  //
  // MARKUP FORMATTING IS LOAD-BEARING (svelte-adapter-dom-shim §16): sibling nodes are packed
  // edge-to-edge with zero whitespace between them, and every text node stays on ONE source line.
  import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/svelte';
  import {
    AuthenticationType,
    SecurityLevel,
    authenticateAsync,
    cancelAuthenticate,
    getEnrolledLevelAsync,
    hasHardwareAsync,
    isEnrolledAsync,
    supportedAuthenticationTypesAsync,
  } from '@symbiote-native/local-auth/svelte';
  import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function capabilityStatusText(status: ICapabilityStatus): string {
    if (status === 'checking') return 'CHECKING…';
    return status === 'yes' ? 'YES' : 'NO';
  }

  function authenticationTypeLabel(type: AuthenticationType): string {
    switch (type) {
      case AuthenticationType.FINGERPRINT:
        return 'Fingerprint';
      case AuthenticationType.FACIAL_RECOGNITION:
        return 'Facial recognition';
      case AuthenticationType.IRIS:
        return 'Iris';
      default:
        return 'Unknown';
    }
  }

  // SecurityLevel.BIOMETRIC is a computed enum member (a deprecated getter alias defined via
  // Object.defineProperty, see packages/local-auth/src/core/types.ts) — TS gives each named member
  // declared alongside it its own nominal literal type, so comparing `level` (typed `SecurityLevel`)
  // directly against e.g. `SecurityLevel.BIOMETRIC_WEAK` trips "no overlap" (TS2367). Widening to a
  // plain `number` first (enum members are always assignable to `number`) sidesteps the nominal
  // narrowing entirely — same fix as the React and Vue ports' securityLevelLabel.
  function securityLevelLabel(level: SecurityLevel): string {
    const numericLevel: number = level;
    if (numericLevel === SecurityLevel.NONE) {
      return 'None';
    }
    if (numericLevel === SecurityLevel.SECRET) {
      return 'Secret (PIN / pattern / password)';
    }
    if (numericLevel === SecurityLevel.BIOMETRIC_WEAK) {
      return 'Biometric — weak';
    }
    if (numericLevel === SecurityLevel.BIOMETRIC_STRONG) {
      return 'Biometric — strong';
    }
    // Unreachable via getEnrolledLevelAsync() (never returns the deprecated BIOMETRIC alias
    // itself) — only satisfies the function's string return type.
    return 'Biometric';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
  const lineColor = LINE_COLOR[lineInfo.line];

  let hasHardware = $state<ICapabilityStatus>('checking');
  let isEnrolled = $state<ICapabilityStatus>('checking');
  let enrolledLevel = $state<SecurityLevel | null>(null);
  let supportedTypes = $state<AuthenticationType[] | null>(null);
  let authResult = $state<ILocalAuthenticationResult | null>(null);
  let isAuthenticating = $state(false);

  // The mount-time capability probe. Every write lands in an async continuation, so the effect
  // reads nothing reactive and runs exactly once — the Svelte equivalent of Vue's onMounted.
  $effect(() => {
    void hasHardwareAsync().then(value => {
      hasHardware = toCapabilityStatus(value);
    });
    void isEnrolledAsync().then(value => {
      isEnrolled = toCapabilityStatus(value);
    });
    void getEnrolledLevelAsync().then(value => {
      enrolledLevel = value;
    });
    void supportedAuthenticationTypesAsync().then(value => {
      supportedTypes = value;
    });
  });

  const enrolledLevelText = $derived(
    enrolledLevel === null ? 'checking…' : securityLevelLabel(enrolledLevel),
  );

  const supportedTypesText = $derived.by((): string => {
    if (supportedTypes === null) return 'checking…';
    if (supportedTypes.length === 0) return 'none';
    return supportedTypes.map(authenticationTypeLabel).join(', ');
  });

  const authenticateButtonTitle = $derived(isAuthenticating ? 'Authenticating…' : 'Authenticate');

  const authResultClass = $derived(
    authResult ? `auth-result auth-result-${authResult.success ? 'success' : 'error'}` : '',
  );

  const authResultText = $derived.by((): string => {
    if (!authResult) return '';
    if (authResult.success) return 'Success';
    const warningSuffix = authResult.warning ? ` (${authResult.warning})` : '';
    return `Failed: ${authResult.error}${warningSuffix}`;
  });

  function handleAuthenticate(): void {
    isAuthenticating = true;
    void authenticateAsync({ promptMessage: 'Confirm it is you' }).then(result => {
      authResult = result;
      isAuthenticating = false;
    });
  }

  function handleCancel(): void {
    cancelAuthenticate();
  }
</script>

<SafeAreaView class="screen"
  ><ScrollView testID="local-auth-scroll" class="screen" contentContainerStyle="scroll-content"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: lineColor }}
        ><Text class="hero-badge-text">{lineInfo.code}</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">Local auth</Text><Text class="hero-body">@symbiote-native/local-auth — FaceID/TouchID on iOS, the Fingerprint/Biometric API on Android. A simulator with no enrolled biometrics reports "not enrolled"; a real device with FaceID/TouchID/fingerprint set up is needed to see a live prompt.</Text></View
      ></View
    ><View testID="local-auth-capabilities-card" class="auth-card"
      ><View class="auth-card-header"
        ><Text class="auth-card-title">Capabilities</Text></View
      ><View testID="local-auth-hardware" class="auth-capability-row"
        ><Text class="auth-capability-label">Hardware present</Text><View class={`auth-status-badge auth-status-badge-${hasHardware}`}
          ><Text class="auth-status-text">{capabilityStatusText(hasHardware)}</Text></View
        ></View
      ><View testID="local-auth-enrolled" class="auth-capability-row"
        ><Text class="auth-capability-label">Enrolled</Text><View class={`auth-status-badge auth-status-badge-${isEnrolled}`}
          ><Text class="auth-status-text">{capabilityStatusText(isEnrolled)}</Text></View
        ></View
      ><View class="auth-capability-row"
        ><Text class="auth-capability-label">Enrolled level</Text><Text class="auth-value-text">{enrolledLevelText}</Text></View
      ><View class="auth-capability-row"
        ><Text class="auth-capability-label">Supported types</Text><Text class="auth-value-text">{supportedTypesText}</Text></View
      ></View
    ><View testID="local-auth-authenticate-card" class="auth-card"
      ><View class="auth-card-header"
        ><Text class="auth-card-title">Authenticate</Text></View
      ><Text class="info-text">Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog on Android.</Text><ActionButton
        testID="local-auth-authenticate-button"
        title={authenticateButtonTitle}
        onPress={handleAuthenticate}
        color={lineColor}
      />{#if Platform.OS === 'android'}<ActionButton
        testID="local-auth-cancel-button"
        title="Cancel"
        onPress={handleCancel}
        color={lineColor}
      />{/if}{#if authResult}<View testID="local-auth-result" class={authResultClass}
        ><Text class="auth-result-text">{authResultText}</Text></View
      >{/if}</View
    ></ScrollView
  ></SafeAreaView
>

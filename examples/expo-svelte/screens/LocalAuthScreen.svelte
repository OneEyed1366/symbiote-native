<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
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
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const CAPABILITY_LABEL: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
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

  // `SecurityLevel.BIOMETRIC` is a getter alias, so each sibling member has its own nominal type
  // Widening to `number` first avoids TS2367 "no overlap" on the comparisons below
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

  // Every write lands in an async continuation, so the effect reads nothing reactive and runs once
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

  const authResultText = $derived.by((): string => {
    if (!authResult) return '';
    if (authResult.success) return 'Success';
    const warningSuffix = authResult.warning ? ` (${authResult.warning})` : '';
    return `Failed: ${authResult.error}${warningSuffix}`;
  });

  function handleAuthenticate(): void {
    isAuthenticating = true;
    void authenticateAsync({ promptMessage: 'Confirm it is you' }).then(
      result => {
        authResult = result;
        isAuthenticating = false;
      },
    );
  }

  function handleCancel(): void {
    cancelAuthenticate();
  }
</script>

{#snippet capabilityRow(testID: string, label: string, status: ICapabilityStatus)}
  <view {testID} class="auth-capability-row">
    <text class="auth-capability-label">{label}</text>
    <view class={`auth-status-badge auth-status-badge-${status}`}>
      <text class="auth-status-text">{CAPABILITY_LABEL[status]}</text>
    </view>
  </view>
{/snippet}

{#snippet valueRow(label: string, value: string)}
  <view class="auth-capability-row">
    <text class="auth-capability-label">{label}</text>
    <text class="auth-value-text">{value}</text>
  </view>
{/snippet}

<safe-area-view class="screen">
  <scroll-view
    testID="local-auth-scroll"
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
        <text class="hero-title">Local auth</text>
        <text class="hero-body">
          Confirm it is really the user with Face ID, Touch ID or a fingerprint
          before a sensitive action. A simulator without enrolled biometrics
          reports not enrolled, use a real device with biometrics set up to see
          the prompt.
        </text>
      </view>
    </view>

    <Scenario
      testID="local-auth-scenario"
      title="Re-confirm the user before showing a balance or sending money"
      why="Even on an unlocked phone, ask for a biometric check before opening a private section or approving a payment. The app only learns whether it succeeded, never the fingerprint or face."
      steps={[
        'Check that hardware is present and biometrics are enrolled',
        'Press authenticate and approve with your face or finger',
        'Press it again and cancel',
      ]}
      expect="Success shows a positive result. Cancelling shows the reason, such as user cancel, and the hardware and enrolled rows tell you why a prompt cannot appear."
    />

    <view testID="local-auth-capabilities-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Capabilities</text>
      </view>
      {@render capabilityRow('local-auth-hardware', 'Hardware present', hasHardware)}
      {@render capabilityRow('local-auth-enrolled', 'Enrolled', isEnrolled)}
      {@render valueRow('Enrolled level', enrolledLevelText)}
      {@render valueRow('Supported types', supportedTypesText)}
    </view>

    <view testID="local-auth-authenticate-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Authenticate</text>
      </view>
      <text class="info-text">
        Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog on
        Android.
      </text>
      <ActionButton
        testID="local-auth-authenticate-button"
        title={isAuthenticating ? 'Authenticating…' : 'Authenticate'}
        onPress={handleAuthenticate}
        color={lineColor}
      />
      {#if Platform.OS === 'android'}
        <ActionButton
          testID="local-auth-cancel-button"
          title="Cancel"
          onPress={handleCancel}
          color={lineColor}
        />
      {/if}
      {#if authResult}
        <view
          testID="local-auth-result"
          class={`auth-result auth-result-${authResult.success ? 'success' : 'error'}`}
        >
          <text class="auth-result-text">{authResultText}</text>
        </view>
      {/if}
    </view>
  </scroll-view>
</safe-area-view>

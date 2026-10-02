<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  AuthenticationType,
  SecurityLevel,
  authenticateAsync,
  cancelAuthenticate,
  getEnrolledLevelAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from '@symbiote-native/local-auth/vue';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import AuthCapabilityRow from './AuthCapabilityRow.vue';
import AuthValueRow from './AuthValueRow.vue';

const ANDROID_OS = 'android';
const isAndroidOs = Platform.OS === ANDROID_OS;

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

const hasHardware = ref<ICapabilityStatus>('checking');
const isEnrolled = ref<ICapabilityStatus>('checking');
const enrolledLevel = ref<SecurityLevel | null>(null);
const supportedTypes = ref<AuthenticationType[] | null>(null);
const authResult = ref<ILocalAuthenticationResult | null>(null);
const isAuthenticating = ref(false);

onMounted(() => {
  void hasHardwareAsync().then(value => {
    hasHardware.value = toCapabilityStatus(value);
  });
  void isEnrolledAsync().then(value => {
    isEnrolled.value = toCapabilityStatus(value);
  });
  void getEnrolledLevelAsync().then(value => {
    enrolledLevel.value = value;
  });
  void supportedAuthenticationTypesAsync().then(value => {
    supportedTypes.value = value;
  });
});

const enrolledLevelText = computed(() =>
  enrolledLevel.value === null ? 'checking…' : securityLevelLabel(enrolledLevel.value),
);

const supportedTypesText = computed((): string => {
  if (supportedTypes.value === null) return 'checking…';
  if (supportedTypes.value.length === 0) return 'none';
  return supportedTypes.value.map(authenticationTypeLabel).join(', ');
});

const authResultText = computed((): string => {
  const result = authResult.value;
  if (!result) return '';
  if (result.success) return 'Success';
  const warningSuffix = result.warning ? ` (${result.warning})` : '';
  return `Failed: ${result.error}${warningSuffix}`;
});

function handleAuthenticate(): void {
  isAuthenticating.value = true;
  void authenticateAsync({ promptMessage: 'Confirm it is you' }).then(result => {
    authResult.value = result;
    isAuthenticating.value = false;
  });
}

function handleCancel(): void {
  cancelAuthenticate();
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="local-auth-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Local auth</text>
          <text class="hero-body">
            Confirm it is really the user with Face ID, Touch ID or a fingerprint before a
            sensitive action. A simulator without enrolled biometrics reports not enrolled, use a
            real device with biometrics set up to see the prompt.
          </text>
        </view>
      </view>

      <Scenario
        testID="local-auth-scenario"
        title="Re-confirm the user before showing a balance or sending money"
        why="Even on an unlocked phone, ask for a biometric check before opening a private section or approving a payment. The app only learns whether it succeeded, never the fingerprint or face."
        :steps="[
          'Check that hardware is present and biometrics are enrolled',
          'Press authenticate and approve with your face or finger',
          'Press it again and cancel',
        ]"
        expect="Success shows a positive result. Cancelling shows the reason, such as user cancel, and the hardware and enrolled rows tell you why a prompt cannot appear."
      />

      <view testID="local-auth-capabilities-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Capabilities</text>
        </view>
        <AuthCapabilityRow testID="local-auth-hardware" label="Hardware present" :status="hasHardware" />
        <AuthCapabilityRow testID="local-auth-enrolled" label="Enrolled" :status="isEnrolled" />
        <AuthValueRow label="Enrolled level" :value="enrolledLevelText" />
        <AuthValueRow label="Supported types" :value="supportedTypesText" />
      </view>

      <view testID="local-auth-authenticate-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Authenticate</text>
        </view>
        <text class="info-text">
          Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog on Android.
        </text>
        <ActionButton
          testID="local-auth-authenticate-button"
          :title="isAuthenticating ? 'Authenticating…' : 'Authenticate'"
          :onPress="handleAuthenticate"
          :color="lineColor"
        />
        <ActionButton
          v-if="isAndroidOs"
          testID="local-auth-cancel-button"
          title="Cancel"
          :onPress="handleCancel"
          :color="lineColor"
        />
        <view
          v-if="authResult"
          testID="local-auth-result"
          :class="`auth-result auth-result-${authResult.success ? 'success' : 'error'}`"
        >
          <text class="auth-result-text">{{ authResultText }}</text>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>

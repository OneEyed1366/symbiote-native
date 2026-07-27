import { Component, signal } from '@angular/core';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import {
  AuthenticationType,
  SecurityLevel,
  authenticateAsync,
  cancelAuthenticate,
  getEnrolledLevelAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from '@symbiote-native/local-auth/angular';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

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

// SecurityLevel.BIOMETRIC is a computed enum member (a deprecated getter alias defined via
// Object.defineProperty, see packages/local-auth/src/core/types.ts) — TS gives each named member
// declared alongside it its own nominal literal type, so comparing `level` (typed `SecurityLevel`)
// directly against e.g. `SecurityLevel.BIOMETRIC_WEAK` trips "no overlap" (TS2367). Widening to a
// plain `number` first (enum members are always assignable to `number`) sidesteps the nominal
// narrowing entirely — same fix as ../react/screens/LocalAuthScreen.tsx's twin helper.
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

/**
 * @symbiote-native/local-auth canary demo: a capabilities card (hardware present, enrolled,
 * enrolled security level, supported biometric types) followed by a live authenticateAsync()
 * button. cancelAuthenticate() is Android-only upstream — the Cancel button only renders there.
 * Angular twin of ../../react/screens/LocalAuthScreen.tsx — same 4 capability signals + result
 * state, populated at constructor time (no per-instance service to inject, unlike SensorsScreen's
 * Angular services — these are plain async functions off the core package).
 */
@Component({
  selector: 'LocalAuthScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="local-auth-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Local auth</Text>
            <Text class="hero-body">
              @symbiote-native/local-auth — FaceID/TouchID on iOS, the Fingerprint/Biometric API on
              Android. A simulator with no enrolled biometrics reports "not enrolled"; a real
              device with FaceID/TouchID/fingerprint set up is needed to see a live prompt.
            </Text>
          </View>
        </View>

        <View testID="local-auth-capabilities-card" class="auth-card">
          <View class="auth-card-header">
            <Text class="auth-card-title">Capabilities</Text>
          </View>
          <View testID="local-auth-hardware" class="auth-capability-row">
            <Text class="auth-capability-label">Hardware present</Text>
            <View [class]="statusBadgeClass(hasHardware())">
              <Text class="auth-status-text">{{ statusLabel(hasHardware()) }}</Text>
            </View>
          </View>
          <View testID="local-auth-enrolled" class="auth-capability-row">
            <Text class="auth-capability-label">Enrolled</Text>
            <View [class]="statusBadgeClass(isEnrolled())">
              <Text class="auth-status-text">{{ statusLabel(isEnrolled()) }}</Text>
            </View>
          </View>
          <View class="auth-capability-row">
            <Text class="auth-capability-label">Enrolled level</Text>
            <Text class="auth-value-text">{{ enrolledLevelLabel() }}</Text>
          </View>
          <View class="auth-capability-row">
            <Text class="auth-capability-label">Supported types</Text>
            @if (supportedTypes(); as types) {
              <Text class="auth-value-text">{{ supportedTypesLabelOf(types) }}</Text>
            } @else {
              <Text class="auth-value-text">checking…</Text>
            }
          </View>
        </View>

        <View testID="local-auth-authenticate-card" class="auth-card">
          <View class="auth-card-header">
            <Text class="auth-card-title">Authenticate</Text>
          </View>
          <Text class="info-text">
            Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog on Android.
          </Text>
          <ActionButton
            testID="local-auth-authenticate-button"
            [title]="isAuthenticating() ? 'Authenticating…' : 'Authenticate'"
            (press)="handleAuthenticate()"
            [color]="lineColor"
          ></ActionButton>
          @if (Platform.OS === 'android') {
            <ActionButton
              testID="local-auth-cancel-button"
              title="Cancel"
              (press)="handleCancel()"
              [color]="lineColor"
            ></ActionButton>
          }
          @if (authResult(); as result) {
            <View
              testID="local-auth-result"
              [class]="'auth-result auth-result-' + (result.success ? 'success' : 'error')"
            >
              <Text class="auth-result-text">
                {{
                  result.success
                    ? 'Success'
                    : 'Failed: ' + result.error + (result.warning ? ' (' + result.warning + ')' : '')
                }}
              </Text>
            </View>
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class LocalAuthScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;

  readonly hasHardware = signal<ICapabilityStatus>('checking');
  readonly isEnrolled = signal<ICapabilityStatus>('checking');
  readonly enrolledLevel = signal<SecurityLevel | null>(null);
  readonly supportedTypes = signal<AuthenticationType[] | null>(null);
  readonly authResult = signal<ILocalAuthenticationResult | null>(null);
  readonly isAuthenticating = signal(false);

  constructor() {
    hasHardwareAsync().then(value => this.hasHardware.set(toCapabilityStatus(value)));
    isEnrolledAsync().then(value => this.isEnrolled.set(toCapabilityStatus(value)));
    getEnrolledLevelAsync().then(value => this.enrolledLevel.set(value));
    supportedAuthenticationTypesAsync().then(value => this.supportedTypes.set(value));
  }

  handleAuthenticate(): void {
    this.isAuthenticating.set(true);
    authenticateAsync({ promptMessage: 'Confirm it is you' }).then(result => {
      this.authResult.set(result);
      this.isAuthenticating.set(false);
    });
  }

  handleCancel(): void {
    cancelAuthenticate();
  }

  // A plain method rather than a template `@if (enrolledLevel(); as level)` — SecurityLevel.NONE
  // is 0, which JS/Angular's control-flow syntax treats as falsy, so that pattern would wrongly
  // fall through to "checking…" for a real resolved "None" result. Explicit `=== null` sidesteps
  // the numeric-zero trap entirely.
  enrolledLevelLabel(): string {
    const level = this.enrolledLevel();
    return level === null ? 'checking…' : securityLevelLabel(level);
  }

  supportedTypesLabelOf(types: AuthenticationType[]): string {
    return types.length === 0 ? 'none' : types.map(authenticationTypeLabel).join(', ');
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `auth-status-badge auth-status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  }
}

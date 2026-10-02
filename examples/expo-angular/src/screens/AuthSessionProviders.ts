import { Component, signal } from '@angular/core';
import {
  FacebookAuthRequest,
  GoogleAuthRequest,
  facebookDiscovery,
  googleDiscovery,
} from '@symbiote-native/auth-session/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AuthSessionFacebookProbe } from './AuthSessionFacebookProbe';
import { AuthSessionGoogleIdTokenProbe } from './AuthSessionGoogleIdTokenProbe';
import { AuthSessionGoogleProbe } from './AuthSessionGoogleProbe';
import {
  INITIAL_PROVIDER_FORM,
  MODE,
  MODES,
} from './auth-session-provider-form';
import type { IMode, IProviderForm } from './auth-session-provider-form';

@Component({
  selector: 'AuthSessionProviders',
  standalone: true,
  imports: [
    AuthSessionFacebookProbe,
    AuthSessionGoogleIdTokenProbe,
    AuthSessionGoogleProbe,
    CallConsole,
    Card,
    ChoiceRow,
    Field,
    ToggleRow,
  ],
  template: `
    <Card testID="auth-session-provider-card" title="Google and Facebook hooks">
      <Field
        testID="auth-session-provider-client-input"
        label="clientId (Facebook app id or Google fallback)"
        [value]="form().clientId"
        (valueChange)="patch({ clientId: $event })"
      />
      <Field
        testID="auth-session-web-client-input"
        label="webClientId"
        [value]="form().webClientId"
        (valueChange)="patch({ webClientId: $event })"
      />
      <Field
        testID="auth-session-ios-client-input"
        label="iosClientId"
        [value]="form().iosClientId"
        (valueChange)="patch({ iosClientId: $event })"
      />
      <Field
        testID="auth-session-android-client-input"
        label="androidClientId"
        [value]="form().androidClientId"
        (valueChange)="patch({ androidClientId: $event })"
      />
      <Field
        testID="auth-session-login-hint-input"
        label="loginHint"
        [value]="form().loginHint"
        (valueChange)="patch({ loginHint: $event })"
      />
      <Field
        testID="auth-session-provider-scheme-input"
        label="redirect scheme"
        [value]="form().scheme"
        (valueChange)="patch({ scheme: $event })"
      />
      <ToggleRow
        testID="auth-session-select-account-switch"
        label="selectAccount"
        [value]="form().selectAccount"
        (valueChange)="patch({ selectAccount: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="auth-session-auto-exchange-switch"
        label="shouldAutoExchangeCode"
        [value]="form().shouldAutoExchangeCode"
        (valueChange)="patch({ shouldAutoExchangeCode: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="auth-session-provider-mode"
        label="mounted hook"
        [options]="modes"
        [(value)]="mode"
        [color]="color"
      />
      @switch (mode()) {
        @case (modeKind.google) {
          <AuthSessionGoogleProbe [form]="form()" />
        }
        @case (modeKind.googleIdToken) {
          <AuthSessionGoogleIdTokenProbe [form]="form()" />
        }
        @case (modeKind.facebook) {
          <AuthSessionFacebookProbe [form]="form()" />
        }
      }
    </Card>
    <CallConsole
      prefix="auth-session-provider-classes"
      title="Provider classes and discovery"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class AuthSessionProviders {
  readonly color = lineColorOf(ROUTE_NAME.AuthSession);
  readonly modes = MODES;
  readonly modeKind = MODE;

  readonly form = signal<IProviderForm>({ ...INITIAL_PROVIDER_FORM });
  readonly mode = signal<IMode>(MODE.off);

  patch(change: Partial<IProviderForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }

  private redirectUri(): string {
    return `${this.form().scheme}:/redirect`;
  }

  private clientId(): string {
    return this.form().clientId || 'demo';
  }

  readonly calls: ICall[] = [
    { label: 'googleDiscovery', run: async () => googleDiscovery },
    { label: 'facebookDiscovery', run: async () => facebookDiscovery },
    {
      label: 'GoogleAuthRequest',
      run: async () => {
        const request = new GoogleAuthRequest({
          clientId: this.clientId(),
          redirectUri: this.redirectUri(),
        });
        return request.makeAuthUrlAsync(googleDiscovery);
      },
    },
    {
      label: 'FacebookAuthRequest',
      run: async () => {
        const request = new FacebookAuthRequest({
          clientId: this.clientId(),
          redirectUri: this.redirectUri(),
        });
        return request.makeAuthUrlAsync(facebookDiscovery);
      },
    },
  ];
}

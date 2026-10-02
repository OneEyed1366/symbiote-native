import { Component, signal } from '@angular/core';
import type {
  IDiscoveryDocument,
  TokenResponse,
} from '@symbiote-native/auth-session/angular';
import { Explorer } from '../components/Explorer';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AuthSessionConfig } from './AuthSessionConfig';
import { AuthSessionDiscovery } from './AuthSessionDiscovery';
import { AuthSessionHookFlows } from './AuthSessionHookFlows';
import { AuthSessionManualFlow } from './AuthSessionManualFlow';
import { AuthSessionProviders } from './AuthSessionProviders';
import { AuthSessionRedirect } from './AuthSessionRedirect';
import { AuthSessionResult } from './AuthSessionResult';
import { AuthSessionTokens } from './AuthSessionTokens';
import { INITIAL_FORM } from './auth-session-form';
import type { IForm } from './auth-session-form';

@Component({
  selector: 'AuthSessionScreen',
  standalone: true,
  imports: [
    AuthSessionConfig,
    AuthSessionDiscovery,
    AuthSessionHookFlows,
    AuthSessionManualFlow,
    AuthSessionProviders,
    AuthSessionRedirect,
    AuthSessionResult,
    AuthSessionTokens,
    Explorer,
    Scenario,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="auth-session-scroll"
      title="Auth Session"
      body="Sign users in with any OAuth 2 or OpenID Connect provider through the system browser, with PKCE, token exchange and refresh. Ready-made flows for Google and Facebook."
    >
      <Scenario
        testID="auth-session-scenario"
        title="Sign in with an identity provider"
        why="Let users log in with their existing account. The provider page opens in a secure browser, your app receives a code, exchanges it for tokens and never sees the password."
        [steps]="steps"
        expect="The result card shows the authorization code or an error from the provider. The token cards below exchange and refresh it."
      />
      <AuthSessionRedirect [(form)]="form" [color]="color" />
      <AuthSessionDiscovery
        [(form)]="form"
        [(discovery)]="discovery"
        [color]="color"
      />
      <AuthSessionConfig [(form)]="form" [color]="color" />
      <AuthSessionManualFlow
        [form]="form()"
        [discovery]="discovery()"
        [color]="color"
        (result)="result.set($event)"
      />
      <AuthSessionResult [result]="result()" />
      <Explorer testID="auth-session-explorer" [color]="color">
        <ng-template>
          <AuthSessionHookFlows
            [form]="form()"
            [discovery]="discovery()"
            [color]="color"
            (result)="result.set($event)"
          />
          <AuthSessionTokens
            [form]="form()"
            [discovery]="discovery()"
            [(token)]="token"
            [color]="color"
          />
          <AuthSessionProviders />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class AuthSessionScreen {
  readonly route = ROUTE_NAME.AuthSession;
  readonly color = lineColorOf(ROUTE_NAME.AuthSession);
  readonly steps = [
    'Set the redirect scheme (canaryexpo is registered in this app)',
    'Enter the provider issuer and your client id below',
    'Press the manual flow button and sign in',
  ];

  readonly form = signal<IForm>({ ...INITIAL_FORM });
  readonly discovery = signal<IDiscoveryDocument | null>(null);
  readonly token = signal<TokenResponse | null>(null);
  readonly result = signal<unknown>(null);
}

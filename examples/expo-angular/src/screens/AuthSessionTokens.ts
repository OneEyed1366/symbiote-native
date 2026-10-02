import { Component, input, model, signal } from '@angular/core';
import {
  AccessTokenRequest,
  GrantType,
  RefreshTokenRequest,
  RevokeTokenRequest,
  TokenResponse,
  TokenTypeHint,
  exchangeCodeAsync,
  fetchUserInfoAsync,
  getCurrentTimeInSeconds,
  refreshAsync,
  requestAsync,
  revokeAsync,
} from '@symbiote-native/auth-session/angular';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { parseRecord } from './auth-session-form';
import type { IForm } from './auth-session-form';
import { classify, need, tokenSummary } from './auth-session-token-helpers';

@Component({
  selector: 'AuthSessionTokens',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field],
  template: `
    <Card testID="auth-session-token-card" title="Token request inputs">
      <Field
        testID="auth-session-code-input"
        label="authorization code"
        [(value)]="code"
      />
      <Field
        testID="auth-session-refresh-input"
        label="refreshToken (empty uses the last token)"
        [(value)]="refresh"
      />
      <ChoiceRow
        testID="auth-session-hint"
        label="TokenTypeHint"
        [options]="hintChoices"
        [(value)]="hint"
        [color]="color()"
      />
      <Field
        testID="auth-session-query-params-input"
        label="fromQueryParams (JSON object)"
        [(value)]="params"
        placeholder='{"access_token": "abc", "expires_in": "3600"}'
      />
      <Field
        testID="auth-session-request-url-input"
        label="requestAsync url"
        [(value)]="url"
      />
    </Card>
    <CallConsole
      prefix="auth-session-token-calls"
      title="Token endpoint calls"
      [color]="color()"
      [calls]="tokenCalls"
    />
    <CallConsole
      prefix="auth-session-request-classes"
      title="Request classes"
      [color]="color()"
      hint="Each class builds the request without sending it, getQueryBody shows the wire form."
      [calls]="requestClassCalls"
    />
    <CallConsole
      prefix="auth-session-token-response"
      title="TokenResponse"
      [color]="color()"
      [calls]="tokenResponseCalls"
    />
    <CallConsole
      prefix="auth-session-fetch"
      title="requestAsync"
      [color]="color()"
      [calls]="fetchCalls"
    />
  `,
})
export class AuthSessionTokens {
  readonly form = input.required<IForm>();
  readonly discovery = input.required<IDiscoveryDocument | null>();
  readonly token = model.required<TokenResponse | null>();
  readonly color = input.required<string>();

  readonly hintChoices = Object.values(TokenTypeHint).map(value => ({
    label: value,
    value,
  }));

  readonly code = signal('');
  readonly refresh = signal('');
  readonly hint = signal(TokenTypeHint.AccessToken);
  readonly url = signal('https://example.com/');
  readonly params = signal('');

  private endpoints(): IDiscoveryDocument {
    return need(this.discovery(), 'resolve discovery');
  }

  private current(): TokenResponse {
    return need(this.token(), 'get a token');
  }

  private base() {
    return {
      clientId: this.form().clientId,
      scopes: this.form()
        .scopes.split(' ')
        .filter(scope => scope !== ''),
    };
  }

  private refreshToken(): string | undefined {
    const typed = this.refresh().trim();
    return typed === '' ? this.token()?.refreshToken : typed;
  }

  private accessConfig() {
    return {
      ...this.base(),
      code: this.code(),
      redirectUri: this.form().redirectUri,
      extraParams: parseRecord(this.form().extraParams),
    };
  }

  readonly tokenCalls: ICall[] = [
    {
      label: 'exchangeCodeAsync',
      run: async () => {
        const next = await exchangeCodeAsync(
          this.accessConfig(),
          this.endpoints(),
        );
        this.token.set(next);
        return tokenSummary(next);
      },
    },
    {
      label: 'refreshAsync',
      run: async () => {
        const next = await refreshAsync(
          { ...this.base(), refreshToken: this.refreshToken() },
          this.endpoints(),
        );
        this.token.set(next);
        return tokenSummary(next);
      },
    },
    {
      label: 'revokeAsync',
      run: () =>
        revokeAsync(
          {
            ...this.base(),
            token: this.current().accessToken,
            tokenTypeHint: this.hint(),
          },
          this.endpoints(),
        ),
    },
    {
      label: 'fetchUserInfoAsync',
      run: () =>
        fetchUserInfoAsync(
          { accessToken: this.current().accessToken },
          this.endpoints(),
        ),
    },
    {
      label: 'provoke TokenError (bad code)',
      run: async () => {
        try {
          await exchangeCodeAsync(
            { ...this.accessConfig(), code: 'invalid-code' },
            this.endpoints(),
          );
          return 'unexpectedly succeeded';
        } catch (error) {
          return classify(error);
        }
      },
    },
  ];

  readonly requestClassCalls: ICall[] = [
    {
      label: 'AccessTokenRequest',
      run: async () => {
        const request = new AccessTokenRequest(this.accessConfig());
        return {
          grant: GrantType.AuthorizationCode,
          config: request.getRequestConfig(),
          body: request.getQueryBody(),
        };
      },
    },
    {
      label: 'RefreshTokenRequest',
      run: async () => {
        const request = new RefreshTokenRequest({
          ...this.base(),
          refreshToken: this.refreshToken(),
        });
        return { grant: GrantType.RefreshToken, body: request.getQueryBody() };
      },
    },
    {
      label: 'RevokeTokenRequest',
      run: async () => {
        const request = new RevokeTokenRequest({
          ...this.base(),
          token: 'sample-token',
          tokenTypeHint: this.hint(),
        });
        return request.getQueryBody();
      },
    },
  ];

  readonly tokenResponseCalls: ICall[] = [
    {
      label: 'TokenResponse.fromQueryParams',
      run: async () => {
        const next = TokenResponse.fromQueryParams(
          parseRecord(this.params()) ?? {},
        );
        this.token.set(next);
        return tokenSummary(next);
      },
    },
    {
      label: 'getCurrentTimeInSeconds',
      run: async () => getCurrentTimeInSeconds(),
    },
    {
      label: 'TokenResponse.isTokenFresh',
      run: async () => TokenResponse.isTokenFresh(this.current()),
    },
    { label: 'shouldRefresh', run: async () => this.current().shouldRefresh() },
    {
      label: 'getRequestConfig',
      run: async () => this.current().getRequestConfig(),
    },
    {
      label: 'refreshAsync (instance)',
      run: async () =>
        tokenSummary(
          await this.current().refreshAsync(this.base(), this.endpoints()),
        ),
    },
  ];

  readonly fetchCalls: ICall[] = [
    {
      label: 'requestAsync GET json',
      run: () => requestAsync(this.url(), { method: 'GET', dataType: 'json' }),
    },
  ];
}

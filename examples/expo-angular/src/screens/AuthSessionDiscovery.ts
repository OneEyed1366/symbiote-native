import { Component, input, model, signal } from '@angular/core';
import {
  fetchDiscoveryAsync,
  issuerWithWellKnownUrl,
  resolveDiscoveryAsync,
} from '@symbiote-native/auth-session/angular';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';
import type { ICall } from '../components/call-console';
import { AuthSessionAutoDiscoveryProbe } from './AuthSessionAutoDiscoveryProbe';
import type { IForm } from './auth-session-form';

@Component({
  selector: 'AuthSessionDiscovery',
  standalone: true,
  imports: [
    AuthSessionAutoDiscoveryProbe,
    CallConsole,
    Card,
    Field,
    ResultRow,
    ToggleRow,
  ],
  template: `
    <Card testID="auth-session-discovery-card" title="Discovery">
      <Field
        testID="auth-session-issuer-input"
        label="issuer"
        [value]="form().issuer"
        (valueChange)="patchIssuer($event)"
      />
      <ToggleRow
        testID="auth-session-autodiscovery-switch"
        label="useAutoDiscovery(issuer)"
        [(value)]="isHookOn"
        [color]="color()"
      />
      @if (isHookOn()) {
        <AuthSessionAutoDiscoveryProbe
          [issuer]="form().issuer"
          [color]="color()"
          (value)="discovery.set($event)"
        />
      }
      <ResultRow
        testID="auth-session-discovery-endpoints"
        label="authorizationEndpoint"
        [value]="discovery()?.authorizationEndpoint ?? 'not resolved'"
      />
    </Card>
    <CallConsole
      prefix="auth-session-discovery"
      title="Discovery calls"
      [color]="color()"
      [calls]="calls"
    />
  `,
})
export class AuthSessionDiscovery {
  readonly form = model.required<IForm>();
  readonly discovery = model.required<IDiscoveryDocument | null>();
  readonly color = input.required<string>();

  readonly isHookOn = signal(false);

  patchIssuer(issuer: string): void {
    this.form.update(current => ({ ...current, issuer }));
  }

  readonly calls: ICall[] = [
    {
      label: 'fetchDiscoveryAsync',
      run: async () => {
        const url = issuerWithWellKnownUrl(this.form().issuer);
        const document = await fetchDiscoveryAsync(url);
        this.discovery.set(document);
        return { url, ...document };
      },
    },
    {
      label: 'resolveDiscoveryAsync',
      run: async () => {
        const document = await resolveDiscoveryAsync(this.form().issuer);
        this.discovery.set(document);
        return document;
      },
    },
  ];
}

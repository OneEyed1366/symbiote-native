import { Component, input, model } from '@angular/core';
import {
  dismiss,
  makeRedirectUri,
} from '@symbiote-native/auth-session/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import type { ICall } from '../components/call-console';
import { redirectOptions } from './auth-session-form';
import type { IForm } from './auth-session-form';

@Component({
  selector: 'AuthSessionRedirect',
  standalone: true,
  imports: [CallConsole, Card, Field, ToggleRow],
  template: `
    <Card testID="auth-session-redirect-card" title="makeRedirectUri options">
      <Field
        testID="auth-session-scheme-input"
        label="scheme"
        [value]="form().scheme"
        (valueChange)="patch({ scheme: $event })"
      />
      <Field
        testID="auth-session-path-input"
        label="path"
        [value]="form().path"
        (valueChange)="patch({ path: $event })"
      />
      <Field
        testID="auth-session-query-input"
        label="queryParams (JSON object)"
        [value]="form().queryParams"
        (valueChange)="patch({ queryParams: $event })"
      />
      <ToggleRow
        testID="auth-session-triple-switch"
        label="isTripleSlashed"
        [value]="form().isTripleSlashed"
        (valueChange)="patch({ isTripleSlashed: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="auth-session-localhost-switch"
        label="preferLocalhost"
        [value]="form().preferLocalhost"
        (valueChange)="patch({ preferLocalhost: $event })"
        [color]="color()"
      />
      <Field
        testID="auth-session-native-input"
        label="native"
        [value]="form().native"
        (valueChange)="patch({ native: $event })"
      />
    </Card>
    <CallConsole
      prefix="auth-session-redirect"
      title="Redirect and lifecycle"
      [color]="color()"
      hint="The redirect uri must be registered with the provider, and Android also needs a matching intent filter for the scheme."
      [calls]="calls"
    />
  `,
})
export class AuthSessionRedirect {
  readonly form = model.required<IForm>();
  readonly color = input.required<string>();

  patch(change: Partial<IForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }

  readonly calls: ICall[] = [
    {
      label: 'makeRedirectUri',
      run: async () => {
        const uri = makeRedirectUri(redirectOptions(this.form()));
        this.patch({ redirectUri: uri });
        return uri;
      },
    },
    { label: 'dismiss', run: async () => dismiss() },
  ];
}

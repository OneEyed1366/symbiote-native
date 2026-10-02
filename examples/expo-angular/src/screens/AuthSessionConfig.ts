import { Component, input, model } from '@angular/core';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import {
  CHALLENGE_METHOD_CHOICES,
  PROMPT_CHOICES,
  RESPONSE_TYPE_CHOICES,
} from './auth-session-form';
import type { IForm } from './auth-session-form';

@Component({
  selector: 'AuthSessionConfig',
  standalone: true,
  imports: [Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="auth-session-config-card" title="AuthRequest config">
      <Field
        testID="auth-session-client-input"
        label="clientId"
        [value]="form().clientId"
        (valueChange)="patch({ clientId: $event })"
      />
      <Field
        testID="auth-session-redirect-input"
        label="redirectUri"
        [value]="form().redirectUri"
        (valueChange)="patch({ redirectUri: $event })"
      />
      <Field
        testID="auth-session-scopes-input"
        label="scopes (space separated)"
        [value]="form().scopes"
        (valueChange)="patch({ scopes: $event })"
      />
      <Field
        testID="auth-session-secret-input"
        label="clientSecret"
        [value]="form().clientSecret"
        (valueChange)="patch({ clientSecret: $event })"
      />
      <ChoiceRow
        testID="auth-session-response-type"
        label="responseType"
        [options]="responseTypes"
        [value]="form().responseType"
        (valueChange)="patch({ responseType: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="auth-session-challenge-method"
        label="codeChallengeMethod"
        [options]="challengeMethods"
        [value]="form().codeChallengeMethod"
        (valueChange)="patch({ codeChallengeMethod: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="auth-session-prompt"
        label="prompt"
        [options]="prompts"
        [value]="form().prompt"
        (valueChange)="patch({ prompt: $event })"
        [color]="color()"
      />
      <Field
        testID="auth-session-state-input"
        label="state"
        [value]="form().state"
        (valueChange)="patch({ state: $event })"
      />
      <Field
        testID="auth-session-extra-input"
        label="extraParams (JSON object)"
        [value]="form().extraParams"
        (valueChange)="patch({ extraParams: $event })"
      />
      <ToggleRow
        testID="auth-session-pkce-switch"
        label="usePKCE"
        [value]="form().usePKCE"
        (valueChange)="patch({ usePKCE: $event })"
        [color]="color()"
      />
    </Card>
  `,
})
export class AuthSessionConfig {
  readonly form = model.required<IForm>();
  readonly color = input.required<string>();

  readonly responseTypes = RESPONSE_TYPE_CHOICES;
  readonly challengeMethods = CHALLENGE_METHOD_CHOICES;
  readonly prompts = PROMPT_CHOICES;

  patch(change: Partial<IForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}

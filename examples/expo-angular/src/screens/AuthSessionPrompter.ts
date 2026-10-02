import { Component, input, output } from '@angular/core';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

@Component({
  selector: 'AuthSessionPrompter',
  standalone: true,
  imports: [ActionButton, ResultRow],
  template: `
    <ResultRow
      testID="auth-session-provider-state"
      [label]="label()"
      [value]="state()"
    />
    <ActionButton
      testID="auth-session-provider-prompt"
      title="promptAsync"
      [color]="color"
      (press)="prompt.emit()"
    />
  `,
})
export class AuthSessionPrompter {
  readonly label = input.required<string>();
  readonly state = input.required<string>();
  readonly prompt = output<void>();

  readonly color = lineColorOf(ROUTE_NAME.AuthSession);
}

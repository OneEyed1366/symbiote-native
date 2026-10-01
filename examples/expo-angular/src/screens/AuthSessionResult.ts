import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { Card } from '../components/Card';
import { summarize } from '../components/call-console';

@Component({
  selector: 'AuthSessionResult',
  standalone: true,
  imports: [Card, SYMBIOTE_ELEMENTS],
  template: `
    <Card testID="auth-session-result-card" title="Last session result">
      <text testID="auth-session-result" class="info-text">
        {{ result() === null ? 'nothing yet' : summarize(result()) }}
      </text>
    </Card>
  `,
})
export class AuthSessionResult {
  readonly result = input.required<unknown>();
  readonly summarize = summarize;
}

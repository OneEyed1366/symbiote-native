import { Component, input, output, signal } from '@angular/core';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/angular';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { AuthSessionHookFlow } from './AuthSessionHookFlow';
import { AuthSessionSplitHookFlow } from './AuthSessionSplitHookFlow';
import type { IForm } from './auth-session-form';

const FLOW = { off: 'off', combined: 'combined', split: 'split' } as const;
type IFlow = (typeof FLOW)[keyof typeof FLOW];

@Component({
  selector: 'AuthSessionHookFlows',
  standalone: true,
  imports: [AuthSessionHookFlow, AuthSessionSplitHookFlow, Card, ChoiceRow],
  template: `
    <Card testID="auth-session-hooks-card" title="Hook flows">
      <ChoiceRow
        testID="auth-session-hook-mode"
        label="mounted hook"
        [options]="flowChoices"
        [(value)]="mode"
        [color]="color()"
      />
      @switch (mode()) {
        @case (flow.combined) {
          <AuthSessionHookFlow
            [form]="form()"
            [discovery]="discovery()"
            [color]="color()"
            (result)="result.emit($event)"
          />
        }
        @case (flow.split) {
          <AuthSessionSplitHookFlow
            [form]="form()"
            [discovery]="discovery()"
            [color]="color()"
          />
        }
      }
    </Card>
  `,
})
export class AuthSessionHookFlows {
  readonly form = input.required<IForm>();
  readonly discovery = input.required<IDiscoveryDocument | null>();
  readonly color = input.required<string>();
  readonly result = output<unknown>();

  readonly flow = FLOW;
  readonly flowChoices = Object.values(FLOW).map(value => ({
    label: value,
    value,
  }));
  readonly mode = signal<IFlow>(FLOW.off);
}

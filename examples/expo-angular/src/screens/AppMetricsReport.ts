import { Component, signal } from '@angular/core';
import { reportError } from '@symbiote-native/app-metrics/angular';
import type { IReportErrorInput } from '@symbiote-native/app-metrics/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { SOURCE_CHOICES } from './app-metrics-helpers';

@Component({
  selector: 'AppMetricsReport',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="app-metrics-report-card" title="reportError input">
      <ChoiceRow
        testID="app-metrics-source"
        label="source"
        [options]="sourceChoices"
        [(value)]="source"
        [color]="color"
      />
      <Field testID="app-metrics-type-input" label="type" [(value)]="type" />
      <Field
        testID="app-metrics-message-input"
        label="message"
        [(value)]="message"
      />
      <Field
        testID="app-metrics-stack-input"
        label="stacktrace"
        [(value)]="stacktrace"
      />
      <Field
        testID="app-metrics-component-stack-input"
        label="componentStack"
        [(value)]="componentStack"
      />
      <ToggleRow
        testID="app-metrics-fatal-switch"
        label="isFatal"
        [(value)]="isFatal"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="app-metrics-report"
      title="Error reporting"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class AppMetricsReport {
  readonly color = lineColorOf(ROUTE_NAME.AppMetrics);
  readonly sourceChoices = SOURCE_CHOICES;

  readonly source = signal<IReportErrorInput['source']>('reportedByUser');
  readonly type = signal('CanaryError');
  readonly message = signal('Reported from the canary');
  readonly stacktrace = signal('at ReportCard (AppMetricsScreen.tsx)');
  readonly componentStack = signal('');
  readonly isFatal = signal(false);

  readonly calls: ICall[] = [
    {
      label: 'reportError',
      run: async () =>
        reportError({
          source: this.source(),
          type: this.type(),
          message: this.message(),
          stacktrace: this.stacktrace(),
          componentStack:
            this.componentStack() === '' ? undefined : this.componentStack(),
          isFatal: this.isFatal(),
        }),
    },
  ];
}

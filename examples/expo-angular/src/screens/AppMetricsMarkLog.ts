import { Component, signal } from '@angular/core';
import {
  clearStoredEntries,
  logEvent,
  markFirstRender,
  markInteractive,
  setGlobalAttributes,
} from '@symbiote-native/app-metrics/angular';
import type { ILogSeverity } from '@symbiote-native/app-metrics/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { SEVERITY_CHOICES, parseAttributes } from './app-metrics-helpers';

@Component({
  selector: 'AppMetricsMarkLog',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field],
  template: `
    <Card testID="app-metrics-mark-card" title="Startup marks">
      <Field
        testID="app-metrics-route-input"
        label="routeName"
        [(value)]="routeName"
      />
      <Field
        testID="app-metrics-params-input"
        label="params (JSON object)"
        [(value)]="params"
      />
    </Card>
    <CallConsole
      prefix="app-metrics-mark"
      title="Marks and storage"
      [color]="color"
      [calls]="markCalls"
    />
    <Card testID="app-metrics-log-card" title="Log events">
      <Field
        testID="app-metrics-log-name-input"
        label="event name"
        [(value)]="name"
      />
      <Field
        testID="app-metrics-log-display-input"
        label="displayName"
        [(value)]="displayName"
      />
      <Field
        testID="app-metrics-log-body-input"
        label="body"
        [(value)]="body"
      />
      <Field
        testID="app-metrics-log-attributes-input"
        label="attributes (JSON object)"
        [(value)]="attributes"
      />
      <ChoiceRow
        testID="app-metrics-severity"
        label="severity"
        [options]="severityChoices"
        [(value)]="severity"
        [color]="color"
      />
      <Field
        testID="app-metrics-global-input"
        label="global attributes (JSON object, empty clears)"
        [(value)]="globalAttributes"
      />
    </Card>
    <CallConsole
      prefix="app-metrics-log"
      title="Logging calls"
      [color]="color"
      [calls]="logCalls"
    />
  `,
})
export class AppMetricsMarkLog {
  readonly color = lineColorOf(ROUTE_NAME.AppMetrics);
  readonly severityChoices = SEVERITY_CHOICES;

  readonly routeName = signal('AppMetrics');
  readonly params = signal('{"demo": true}');
  readonly name = signal('canary_event');
  readonly displayName = signal('Canary event');
  readonly body = signal('Logged from the canary');
  readonly attributes = signal('{"screen": "AppMetrics"}');
  readonly globalAttributes = signal('{"build": "canary"}');
  readonly severity = signal<ILogSeverity>('info');

  readonly markCalls: ICall[] = [
    { label: 'markFirstRender', run: async () => markFirstRender() },
    {
      label: 'markInteractive',
      run: async () =>
        markInteractive({
          routeName: this.routeName(),
          params: parseAttributes(this.params()) ?? undefined,
        }),
    },
    { label: 'clearStoredEntries', run: () => clearStoredEntries() },
  ];

  readonly logCalls: ICall[] = [
    {
      label: 'logEvent',
      run: async () =>
        logEvent(this.name(), {
          displayName: this.displayName(),
          body: this.body(),
          attributes: parseAttributes(this.attributes()),
          severity: this.severity(),
        }),
    },
    {
      label: 'setGlobalAttributes',
      run: async () =>
        setGlobalAttributes(parseAttributes(this.globalAttributes())),
    },
    {
      label: 'setGlobalAttributes(null)',
      run: async () => setGlobalAttributes(null),
    },
  ];
}

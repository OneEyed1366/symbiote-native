import { Component, signal } from '@angular/core';
import {
  getAllCrashReports,
  getForegroundSession,
  getInactiveSessions,
  getMainSession,
} from '@symbiote-native/app-metrics/angular';
import type { Session } from '@symbiote-native/app-metrics/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function sessionSummary(session: Session) {
  return { id: session.id, type: session.type, startDate: session.startDate };
}

@Component({
  selector: 'AppMetricsSessions',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="app-metrics-metric-card" title="Session.addMetric input">
      <Field
        testID="app-metrics-metric-category-input"
        label="category"
        [(value)]="category"
      />
      <Field
        testID="app-metrics-metric-name-input"
        label="name"
        [(value)]="name"
      />
      <Field
        testID="app-metrics-metric-value-input"
        label="value"
        [(value)]="value"
      />
      <Field
        testID="app-metrics-metric-route-input"
        label="routeName"
        [(value)]="routeName"
      />
    </Card>
    <CallConsole
      prefix="app-metrics-sessions"
      title="Sessions"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class AppMetricsSessions {
  readonly color = lineColorOf(ROUTE_NAME.AppMetrics);

  readonly category = signal('canary');
  readonly name = signal('button_press');
  readonly value = signal('1');
  readonly routeName = signal('AppMetrics');

  readonly calls: ICall[] = [
    {
      label: 'getMainSession',
      run: async () => sessionSummary(getMainSession()),
    },
    {
      label: 'getForegroundSession',
      run: async () => {
        const session = await getForegroundSession();
        return session && sessionSummary(session);
      },
    },
    {
      label: 'getInactiveSessions',
      run: async () =>
        (await getInactiveSessions()).map(item => ({
          id: item.id,
          type: item.type,
          metrics: item.metrics.length,
          logs: item.logs.length,
        })),
    },
    { label: 'isActive', run: () => getMainSession().isActive() },
    { label: 'getEndDate', run: () => getMainSession().getEndDate() },
    { label: 'getMetrics', run: () => getMainSession().getMetrics() },
    { label: 'getLogs', run: () => getMainSession().getLogs() },
    {
      label: 'addMetric',
      run: () =>
        getMainSession().addMetric({
          timestamp: new Date().toISOString(),
          category: this.category(),
          name: this.name(),
          value: Number(this.value()),
          routeName: this.routeName(),
        }),
    },
    { label: 'getAllCrashReports (Android)', run: () => getAllCrashReports() },
  ];
}

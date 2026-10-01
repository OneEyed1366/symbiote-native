import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NetworkRequestObserver } from '@symbiote-native/app-metrics/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AppMetricsHookObserver } from './AppMetricsHookObserver';
import {
  DEFAULT_PROBE_URL,
  describeCompleted,
  splitList,
} from './app-metrics-network';

const MAX_LOGGED_EVENTS = 10;

// `HttpErrorResponse` wraps a rejected `fetch` as status 0, the rejection sits in `error`
function causeOf(failure: HttpErrorResponse): string {
  return failure.error instanceof Error
    ? failure.error.message
    : failure.message;
}

@Component({
  selector: 'AppMetricsNetwork',
  standalone: true,
  imports: [
    ActionButton,
    AppMetricsHookObserver,
    Card,
    Field,
    ResultRow,
    ToggleRow,
  ],
  template: `
    <Card testID="app-metrics-network-card" title="NetworkRequestObserver">
      <Field
        testID="app-metrics-hosts-input"
        label="filter.hosts (comma separated)"
        [(value)]="hosts"
        placeholder="example.com"
      />
      <Field
        testID="app-metrics-methods-input"
        label="filter.methods (comma separated)"
        [(value)]="methods"
        placeholder="GET, POST"
      />
      <ToggleRow
        testID="app-metrics-hook-switch"
        label="useNetworkRequestObserver (onStarted, onCompleted)"
        [(value)]="isHookOn"
        [color]="color"
      />
      @if (isHookOn()) {
        <AppMetricsHookObserver
          [hosts]="hosts()"
          [methods]="methods()"
          [line]="pushLine"
        />
      }
      <ActionButton
        testID="app-metrics-direct-button"
        [title]="directTitle()"
        [color]="color"
        (press)="toggleDirect()"
      />
      <ActionButton
        testID="app-metrics-set-filter-button"
        title="setFilter(current fields)"
        [color]="color"
        (press)="setFilter()"
      />
      <Field
        testID="app-metrics-probe-input"
        label="request to fire"
        [(value)]="probeUrl"
      />
      <ActionButton
        testID="app-metrics-fetch-button"
        title="fetch(url)"
        [color]="color"
        (press)="fireFetch()"
      />
      <ResultRow
        testID="app-metrics-network-log"
        label="events"
        [value]="logText()"
      />
    </Card>
  `,
})
export class AppMetricsNetwork {
  readonly color = lineColorOf(ROUTE_NAME.AppMetrics);

  readonly hosts = signal('');
  readonly methods = signal('');
  readonly isHookOn = signal(false);
  readonly probeUrl = signal(DEFAULT_PROBE_URL);
  readonly lines = signal<string[]>([]);
  private readonly direct = signal<NetworkRequestObserver | null>(null);

  // The root `provideHttpClient(withFetch())` sends it through the global fetch
  private readonly http = inject(HttpClient);

  readonly directTitle = computed(() =>
    this.direct() === null
      ? 'new NetworkRequestObserver(filter)'
      : 'release the direct observer',
  );
  readonly logText = computed(() =>
    this.lines().length === 0 ? 'none yet' : this.lines().join('\n'),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.direct()?.release());
  }

  readonly pushLine = (line: string): void => {
    this.lines.update(current =>
      [line, ...current].slice(0, MAX_LOGGED_EVENTS),
    );
  };

  toggleDirect(): void {
    const current = this.direct();
    if (current !== null) {
      current.release();
      this.direct.set(null);
      return;
    }
    const observer = new NetworkRequestObserver({
      hosts: splitList(this.hosts()),
      methods: splitList(this.methods()),
    });
    observer.addListener('requestCompleted', event =>
      this.pushLine(`direct ${describeCompleted(event)}`),
    );
    this.direct.set(observer);
  }

  setFilter(): void {
    this.direct()?.setFilter({
      hosts: splitList(this.hosts()),
      methods: splitList(this.methods()),
    });
  }

  fireFetch(): void {
    this.http.get(this.probeUrl(), { responseType: 'text' }).subscribe({
      error: (failure: HttpErrorResponse) =>
        this.pushLine(`fetch failed: ${causeOf(failure)}`),
    });
  }
}

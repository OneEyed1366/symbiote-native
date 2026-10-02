import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectNetworkRequestObserver } from '@symbiote-native/app-metrics/angular';
import {
  describeCompleted,
  describeStarted,
  splitList,
} from './app-metrics-network';

@Component({
  selector: 'AppMetricsHookObserver',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<view />`,
})
export class AppMetricsHookObserver {
  readonly hosts = input.required<string>();
  readonly methods = input.required<string>();
  readonly line = input.required<(line: string) => void>();

  // Options are read inside an effect, so the required inputs are already set by then
  private readonly observer = injectNetworkRequestObserver(() => ({
    filter: {
      hosts: splitList(this.hosts()),
      methods: splitList(this.methods()),
    },
    onStarted: event => this.line()(describeStarted(event)),
    onCompleted: event => this.line()(describeCompleted(event)),
  }));
}

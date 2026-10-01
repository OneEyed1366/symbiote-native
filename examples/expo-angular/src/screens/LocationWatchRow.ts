import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import type { ILocationSubscription } from '@symbiote-native/location/angular';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';

@Component({
  selector: 'LocationWatchRow',
  standalone: true,
  imports: [ResultRow, ToggleRow],
  template: `
    <ToggleRow
      [testID]="prefix() + '-switch'"
      [label]="label()"
      [value]="isOn()"
      (valueChange)="toggle($event)"
      [color]="color()"
    />
    <ResultRow
      [testID]="prefix() + '-output'"
      label="latest"
      [value]="output()"
    />
  `,
})
export class LocationWatchRow<T> {
  readonly prefix = input.required<string>();
  readonly label = input.required<string>();
  readonly color = input.required<string>();
  readonly start =
    input.required<
      (
        onValue: (value: T) => void,
        onError: (reason: string) => void,
      ) => Promise<ILocationSubscription>
    >();
  readonly format = input.required<(value: T) => string>();

  readonly isOn = signal(false);
  readonly output = signal('not watching');
  private subscription: ILocationSubscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscription?.remove());
  }

  toggle(next: boolean): void {
    if (!next) {
      this.subscription?.remove();
      this.subscription = null;
      this.isOn.set(false);
      return;
    }
    this.start()(
      value => this.output.set(this.format()(value)),
      reason => this.output.set(`error: ${reason}`),
    )
      .then(sub => {
        this.subscription = sub;
        this.isOn.set(true);
      })
      .catch((error: Error) => this.output.set(`failed: ${error.message}`));
  }
}

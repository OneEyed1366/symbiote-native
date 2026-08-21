import { Component, input, model, output } from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { Text, View } from '@symbiote-native/angular';
import { ActionButton } from './ActionButton';

// Signal-based component API: input()/input.required() with a `transform`, model() for two-way
// state, output()/outputFromObservable() for events - demoed together, since a real component
// typically mixes all three rather than using one in isolation.
@Component({
  selector: 'PlaygroundCounterChild',
  standalone: true,
  imports: [ActionButton, Text, View],
  template: `
    <View class="pg-row">
      <Text testID="pg-counter-readout" class="info-text">{{
        label() + ': ' + count() + ' (step ' + step() + ')'
      }}</Text>
      <View class="row">
        <ActionButton
          testID="pg-counter-dec"
          title="-"
          color="#dd0031"
          (press)="decrement()"
        ></ActionButton>
        <ActionButton
          testID="pg-counter-inc"
          title="+"
          color="#5ec8f2"
          (press)="increment()"
        ></ActionButton>
      </View>
    </View>
  `,
})
export class PlaygroundCounterChild {
  // input.required(): the parent MUST bind it, checked at compile time.
  readonly label = input.required<string>();
  // input() with a `transform`: the bound value is coerced/clamped before storage, proving
  // InputSignalWithTransform<number, string | number>.
  readonly step = input<number, string | number>(1, {
    transform: value => Math.max(1, Math.trunc(Number(value))),
  });
  // model.required(): a writable "model" signal - reading/writing it here propagates back to
  // whatever the parent bound via `[(count)]`.
  readonly count = model.required<number>();

  private readonly incrementedSource = new Subject<number>();

  // output(): the plain, EventEmitter-flavored form.
  readonly reset = output<void>();
  // outputFromObservable(): the same event surface, sourced from an RxJS Subject instead of an
  // imperative `.emit()` call.
  readonly incremented = outputFromObservable(this.incrementedSource);

  increment(): void {
    const next = this.count() + this.step();
    this.count.set(next);
    this.incrementedSource.next(next);
  }

  decrement(): void {
    if (this.count() <= 0) {
      this.reset.emit();
      return;
    }
    this.count.set(this.count() - this.step());
  }
}

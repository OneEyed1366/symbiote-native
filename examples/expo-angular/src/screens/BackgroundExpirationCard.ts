import { Component, DestroyRef, inject, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { addExpirationListener } from '@symbiote-native/background-task';
import { Card } from '../components/Card';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const MAX_LOGGED_EVENTS = 6;

@Component({
  selector: 'BackgroundExpirationCard',
  standalone: true,
  imports: [Card, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <Card
      testID="background-tasks-expiration-card"
      title="addExpirationListener (background-task)"
    >
      <ToggleRow
        testID="background-tasks-expiration-switch"
        label="listen for the OS expiring the task"
        [value]="isOn()"
        (valueChange)="toggle($event)"
        [color]="color"
      />
      <text testID="background-tasks-expiration-log" class="info-text">{{
        logText()
      }}</text>
    </Card>
  `,
})
export class BackgroundExpirationCard {
  readonly color = lineColorOf(ROUTE_NAME.BackgroundTasks);
  readonly isOn = signal(false);
  private readonly lines = signal<string[]>([]);
  private subscription: ReturnType<typeof addExpirationListener> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.remove();
      this.subscription = null;
    });
  }

  logText(): string {
    const lines = this.lines();
    return lines.length === 0 ? 'no expiration yet' : lines.join('\n');
  }

  toggle(next: boolean): void {
    this.isOn.set(next);
    if (next) {
      this.subscription = addExpirationListener(() => {
        this.lines.update(lines =>
          [`expired at ${new Date().toISOString()}`, ...lines].slice(
            0,
            MAX_LOGGED_EVENTS,
          ),
        );
      });
    } else {
      this.subscription?.remove();
      this.subscription = null;
    }
  }
}

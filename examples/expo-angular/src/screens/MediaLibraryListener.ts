import { Component, DestroyRef, inject, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  addListener,
  removeAllListeners,
} from '@symbiote-native/media-library/angular';
import { Card } from '../components/Card';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const MAX_LOGGED_EVENTS = 6;

@Component({
  selector: 'MediaLibraryListener',
  standalone: true,
  imports: [Card, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <Card testID="media-library-listener-card" title="Change listener">
      <ToggleRow
        testID="media-library-listener-switch"
        label="addListener / removeAllListeners"
        [value]="isOn()"
        (valueChange)="toggle($event)"
        [color]="color"
      />
      <text testID="media-library-listener-log" class="info-text">{{
        logText()
      }}</text>
    </Card>
  `,
})
export class MediaLibraryListener {
  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);
  readonly isOn = signal(false);
  private readonly lines = signal<string[]>([]);
  private subscription: ReturnType<typeof addListener> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.remove();
      this.subscription = null;
    });
  }

  logText(): string {
    const lines = this.lines();
    return lines.length === 0
      ? 'no changes yet, edit the library in another app'
      : lines.join('\n');
  }

  toggle(next: boolean): void {
    this.isOn.set(next);
    if (next) {
      this.subscription = addListener(event => {
        const summary = `incremental ${event.hasIncrementalChanges}, +${event.insertedAssets?.length ?? 0} -${event.deletedAssets?.length ?? 0} ~${event.updatedAssets?.length ?? 0}`;
        this.lines.update(lines =>
          [summary, ...lines].slice(0, MAX_LOGGED_EVENTS),
        );
      });
    } else {
      this.subscription?.remove();
      removeAllListeners();
    }
  }
}

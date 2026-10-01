import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { Directory, Paths } from '@symbiote-native/file-system';
import type { IFileSystemWatchEventType } from '@symbiote-native/file-system';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const MAX_LOGGED_EVENTS = 6;
const WATCH_EVENTS: readonly IFileSystemWatchEventType[] = [
  'created',
  'modified',
  'deleted',
  'renamed',
];
const EVENT_CHOICES = WATCH_EVENTS.map(item => ({ label: item, value: item }));

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

@Component({
  selector: 'FileSystemWatch',
  standalone: true,
  imports: [Card, ChoiceRow, Field, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <Card testID="file-system-watch-card" title="watch (directory)">
      <Field
        testID="file-system-debounce-input"
        label="debounce (ms)"
        [(value)]="debounce"
      />
      <ChoiceRow
        testID="file-system-events"
        label="events"
        [options]="eventChoices"
        [(value)]="events"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-watch-switch"
        label="watch the directory above"
        [value]="isOn()"
        (valueChange)="toggle($event)"
        [color]="color"
      />
      <text testID="file-system-watch-log" class="info-text">{{
        logText()
      }}</text>
    </Card>
  `,
})
export class FileSystemWatch {
  readonly dirName = input.required<string>();

  readonly color = lineColorOf(ROUTE_NAME.FileSystem);
  readonly eventChoices = EVENT_CHOICES;

  readonly isOn = signal(false);
  readonly debounce = signal('100');
  readonly events = signal<IFileSystemWatchEventType>('modified');
  private readonly lines = signal<string[]>([]);
  private subscription: { remove: () => void } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.remove();
      this.subscription = null;
    });
  }

  logText(): string {
    const lines = this.lines();
    return lines.length === 0
      ? 'no events yet, create the directory then change files inside it'
      : lines.join('\n');
  }

  toggle(next: boolean): void {
    this.isOn.set(next);
    if (!next) {
      this.subscription?.remove();
      this.subscription = null;
      return;
    }
    this.subscription = new Directory(Paths.cache, this.dirName()).watch(
      event => {
        this.lines.update(lines =>
          [`${event.type} ${event.target.uri}`, ...lines].slice(
            0,
            MAX_LOGGED_EVENTS,
          ),
        );
      },
      { debounce: optionalNumber(this.debounce()), events: [this.events()] },
    );
  }
}

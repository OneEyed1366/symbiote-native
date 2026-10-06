import { Component, input, output, signal } from '@angular/core';
import type { ILivePhotoAsset } from '@symbiote-native/live-photo/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { findNewestLivePhoto } from './live-photo-shared';

@Component({
  selector: 'LivePhotoLibraryScenario',
  standalone: true,
  imports: [ActionButton, ResultRow, Scenario],
  template: `
    <Scenario
      testID="live-photo-library-scenario"
      title="Show the newest Live Photo without a picker"
      why="A memories widget or a latest-photo header reads the library itself: it finds the newest Live Photo and shows it, with no picker sheet."
      [steps]="steps"
      expect="The newest Live Photo of the device appears in the view below, ready to play. Without a Live Photo the line explains it."
    >
      <ActionButton
        testID="live-photo-library"
        title="Load the newest Live Photo"
        [color]="color()"
        (press)="load()"
      />
      <ResultRow
        testID="live-photo-library-result"
        label="Library"
        [value]="line()"
      />
    </Scenario>
  `,
})
export class LivePhotoLibraryScenario {
  readonly color = input.required<string>();
  readonly found = output<ILivePhotoAsset>();

  readonly steps = ['Press Load the newest Live Photo and allow access'];
  readonly line = signal('not loaded');

  async load(): Promise<void> {
    this.line.set('asking for access…');
    const result = await findNewestLivePhoto();
    if (result.asset !== null) {
      this.found.emit(result.asset);
    }
    this.line.set(result.line);
  }
}

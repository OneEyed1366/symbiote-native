import { Component, input, output, signal } from '@angular/core';
import type { ILivePhotoAsset } from '@symbiote-native/live-photo/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { pickLivePhoto } from './live-photo-shared';

@Component({
  selector: 'LivePhotoPickScenario',
  standalone: true,
  imports: [ActionButton, ResultRow, Scenario],
  template: `
    <Scenario
      testID="live-photo-pick-scenario"
      title="Let the user choose a Live Photo to view"
      why="A Live Photo is a still with a few seconds of motion around it. A gallery, a profile editor or a chat shows the chosen one and plays it on a press, as the Photos app does."
      [steps]="steps"
      expect="The picked Live Photo shows as a still. While you hold a finger on it the motion plays with sound, and on release it settles back to the still."
    >
      <ActionButton
        testID="live-photo-pick"
        title="Pick a Live Photo"
        [color]="color()"
        (press)="pick()"
      />
      <ResultRow
        testID="live-photo-pick-result"
        label="Picker"
        [value]="line()"
      />
    </Scenario>
  `,
})
export class LivePhotoPickScenario {
  readonly color = input.required<string>();
  readonly picked = output<ILivePhotoAsset>();

  readonly steps = [
    'Press Pick a Live Photo and choose one with the LIVE badge',
    'Press and hold the picture below',
  ];
  readonly line = signal('nothing picked');

  async pick(): Promise<void> {
    this.line.set('opening the library…');
    const result = await pickLivePhoto();
    if (result.asset !== null) {
      this.picked.emit(result.asset);
    }
    this.line.set(result.line);
  }
}

import {
  Component,
  Injector,
  OnInit,
  inject,
  input,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectAudioSampleListener } from '@symbiote-native/audio/angular';
import type { AudioPlayer, IAudioSample } from '@symbiote-native/audio/angular';
import { Card } from '../components/Card';
import { ToggleRow } from '../components/ToggleRow';

@Component({
  selector: 'AudioSampleCard',
  standalone: true,
  imports: [Card, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <Card testID="audio-player-sample-card" title="useAudioSampleListener">
      <ToggleRow
        testID="audio-player-sampling-switch"
        [label]="
          'setAudioSamplingEnabled (supported: ' +
          player().isAudioSamplingSupported +
          ')'
        "
        [value]="isOn()"
        (valueChange)="toggle($event)"
        [color]="color()"
      />
      <text testID="audio-player-sample" class="info-text">{{ sample() }}</text>
    </Card>
  `,
})
export class AudioSampleCard implements OnInit {
  readonly player = input.required<AudioPlayer>();
  readonly color = input.required<string>();

  readonly isOn = signal(false);
  readonly sample = signal('no samples yet');
  private readonly injector = inject(Injector);

  // The parent re-creates this card for every new player, so the player never changes here
  ngOnInit(): void {
    runInInjectionContext(this.injector, () =>
      injectAudioSampleListener(this.player(), data => this.onSample(data)),
    );
  }

  private onSample(data: IAudioSample): void {
    this.sample.set(
      `t=${data.timestamp.toFixed(2)}, ${data.channels.length} channel(s), ${data.channels[0]?.frames.length ?? 0} frames`,
    );
  }

  toggle(next: boolean): void {
    this.isOn.set(next);
    this.player().setAudioSamplingEnabled(next);
  }
}

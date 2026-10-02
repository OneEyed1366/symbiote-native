import {
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FontsService } from '@symbiote-native/font/angular';
import { ResultRow } from '../components/ResultRow';

type IFontsState = ReturnType<FontsService['connect']>;

@Component({
  selector: 'FontHookProbe',
  standalone: true,
  imports: [ResultRow],
  template: `<ResultRow
    testID="font-hook-result"
    label="useFonts [loaded, error]"
    [value]="resultText()"
  />`,
})
export class FontHookProbe implements OnInit {
  readonly family = input.required<string>();
  readonly uri = input.required<string>();

  private readonly fonts = inject(FontsService);
  private readonly state = signal<IFontsState | null>(null);

  readonly resultText = computed(() => {
    const state = this.state();
    if (state === null) {
      return 'loading…';
    }
    const error = state.error();
    return `${state.loaded()}, ${error === null ? 'no error' : error.message}`;
  });

  // The map is applied once at creation, a later change of it is not reloaded
  ngOnInit(): void {
    this.state.set(this.fonts.connect({ [this.family()]: this.uri() }));
  }
}

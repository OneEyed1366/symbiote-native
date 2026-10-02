import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { Asset } from '@symbiote-native/asset';
import {
  FontDisplay,
  getLoadedFonts,
  isLoaded,
  isLoading,
  loadAsync,
  renderToImageAsync,
  unloadAllAsync,
  unloadAsync,
} from '@symbiote-native/font/angular';
import type {
  FontSource,
  IRenderToImageResult,
} from '@symbiote-native/font/angular';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { FontHookProbe } from './FontHookProbe';

const SAMPLE_URI =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf';
const SAMPLE_TEXT = 'Symbiote 0123 The quick brown fox';

const BUNDLED_FONT_MODULE = require('../../assets/Pacifico-Regular.ttf');

const SOURCE_MODE = {
  string: 'string',
  number: 'number',
  fontResource: 'FontResource',
  asset: 'Asset',
} as const;
type ISourceMode = (typeof SOURCE_MODE)[keyof typeof SOURCE_MODE];
const MODES: readonly { label: string; value: ISourceMode }[] = [
  { label: 'string uri', value: SOURCE_MODE.string },
  { label: 'number (require)', value: SOURCE_MODE.number },
  { label: 'FontResource', value: SOURCE_MODE.fontResource },
  { label: 'Asset instance', value: SOURCE_MODE.asset },
];
const DISPLAYS = Object.values(FontDisplay).map(value => ({
  label: value,
  value,
}));

@Component({
  selector: 'FontScreen',
  standalone: true,
  imports: [
    ActionButton,
    CallConsole,
    Card,
    ChoiceRow,
    Explorer,
    Field,
    FontHookProbe,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="font-scroll"
      title="Font"
      body="Bring your own typefaces: load custom fonts at runtime from a URL, a bundled file or an Asset, use them by family name and render glyphs to an image."
    >
      <Scenario
        testID="font-load-scenario"
        title="Use a brand font without bundling it into the native project"
        why="Load a custom typeface at runtime from a URL, a bundled file or an Asset, then use its family name in any text style. No native font files or Info.plist entries to maintain."
        [steps]="loadSteps"
        expect="The preview text switches to Pacifico and isLoaded reports true. Switch the source form to number (require) in the explorer to load the bundled file instead."
      >
        <CallConsole
          isBare
          prefix="font-load"
          title="Load and inspect"
          [color]="color"
          hint="unloadAsync and unloadAllAsync always throw UnavailabilityError on native, ExpoFontLoader has no unload method there."
          [calls]="loadCalls"
        />
        <view testID="font-preview-card" class="console-bare">
          <text testID="font-preview" [style]="previewStyle()">{{
            sampleText
          }}</text>
        </view>
      </Scenario>

      <Scenario
        testID="font-hook-card"
        title="Load fonts when a screen mounts"
        why="Declare the fonts a screen needs with one hook and get a loaded flag and an error, instead of wiring promises by hand."
        [steps]="hookSteps"
        expect="The row reads true with no error once the font is ready, or false with the failure message."
      >
        <ToggleRow
          testID="font-hook-switch"
          label="mount a component calling useFonts(map)"
          [(value)]="isHookMounted"
          [color]="color"
        />
        @if (isHookMounted()) {
          <FontHookProbe [family]="family()" [uri]="uri()" />
        }
      </Scenario>

      <Scenario
        testID="font-render-card"
        title="Render text with a font into a picture"
        why="Produce a bitmap of a word or a few glyphs, for share cards, watermarks or icon-font previews, without laying it out on screen first."
        [steps]="renderSteps"
        expect="An image of the glyphs appears with its width, height and scale. Loading the font first makes it use that typeface."
      >
        <Field testID="font-glyphs-input" label="glyphs" [(value)]="glyphs" />
        <Field testID="font-size-input" label="size" [(value)]="size" />
        <Field testID="font-color-input" label="color" [(value)]="textColor" />
        <Field
          testID="font-line-height-input"
          label="lineHeight"
          [(value)]="lineHeight"
        />
        <ActionButton
          testID="font-render-button"
          title="renderToImageAsync"
          [color]="color"
          (press)="render()"
        />
        <ResultRow
          testID="font-render-status"
          label="Status"
          [value]="status()"
        />
        @if (image(); as result) {
          <ResultRow
            testID="font-render-size"
            label="width × height @scale"
            [value]="
              result.width + ' × ' + result.height + ' @' + result.scale + 'x'
            "
          />
          <image
            testID="font-render-image"
            [source]="{ uri: result.uri }"
            [style]="imageStyle(result)"
          ></image>
        }
      </Scenario>

      <Explorer testID="font-explorer" [color]="color">
        <ng-template>
          <Card testID="font-source-card" title="Font source">
            <Field
              testID="font-family-input"
              label="fontFamily"
              [(value)]="family"
            />
            <Field
              testID="font-uri-input"
              label="uri (remote .ttf / .otf)"
              [(value)]="uri"
            />
            <ChoiceRow
              testID="font-mode"
              label="source form"
              [options]="modes"
              [(value)]="mode"
              [color]="color"
            />
            <ChoiceRow
              testID="font-display"
              label="FontResource.display"
              [options]="displays"
              [(value)]="display"
              [color]="color"
            />
            <Field
              testID="font-test-string-input"
              label="FontResource.testString (web only)"
              [(value)]="testString"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class FontScreen {
  readonly route = ROUTE_NAME.Font;
  readonly color = lineColorOf(ROUTE_NAME.Font);
  readonly sampleText = SAMPLE_TEXT;
  readonly modes = MODES;
  readonly displays = DISPLAYS;
  readonly loadSteps = [
    'Press loadAsync(family, source) (Pacifico from a URL is preset)',
    'Look at the preview text below',
  ];
  readonly hookSteps = ['Turn the switch on', 'Watch the result row'];
  readonly renderSteps = [
    'Press renderToImageAsync with the sample glyphs',
    'Change the glyphs, size or color and press again',
  ];

  readonly family = signal('Pacifico');
  readonly uri = signal(SAMPLE_URI);
  readonly mode = signal<ISourceMode>(SOURCE_MODE.string);
  readonly display = signal<FontDisplay>(FontDisplay.AUTO);
  readonly testString = signal('');
  private readonly preview = signal('');
  readonly isHookMounted = signal(false);
  readonly glyphs = signal('Aa Bb 123');
  readonly size = signal('48');
  readonly textColor = signal('#ffffff');
  readonly lineHeight = signal('');
  readonly image = signal<IRenderToImageResult | null>(null);
  readonly status = signal('idle');

  readonly previewStyle = computed(() => ({
    fontFamily: this.preview() === '' ? undefined : this.preview(),
    fontSize: 28,
    color: '#ffffff',
  }));

  readonly loadCalls = [
    {
      label: 'loadAsync(family, source)',
      run: async () => {
        await loadAsync(this.family(), this.toSource());
        this.preview.set(this.family());
        return `loaded ${this.family()}`;
      },
    },
    {
      label: 'loadAsync({ map })',
      run: async () => {
        await loadAsync({ [this.family()]: this.toSource() });
        this.preview.set(this.family());
        return `loaded ${this.family()} via a font map`;
      },
    },
    { label: 'isLoaded', run: async () => isLoaded(this.family()) },
    { label: 'isLoading', run: async () => isLoading(this.family()) },
    { label: 'getLoadedFonts', run: async () => getLoadedFonts() },
    {
      label: 'unloadAsync(family)',
      run: () => unloadAsync(this.family(), { display: this.display() }),
    },
    { label: 'unloadAllAsync', run: () => unloadAllAsync() },
  ];

  private toSource(): FontSource {
    switch (this.mode()) {
      case SOURCE_MODE.string:
        return this.uri();
      case SOURCE_MODE.number:
        return BUNDLED_FONT_MODULE;
      case SOURCE_MODE.fontResource:
        return {
          uri: this.uri(),
          display: this.display(),
          testString: this.testString() === '' ? undefined : this.testString(),
        };
      case SOURCE_MODE.asset:
        return Asset.fromURI(this.uri());
    }
  }

  imageStyle(result: IRenderToImageResult) {
    return {
      width: result.width,
      height: result.height,
      backgroundColor: '#1e293b',
    };
  }

  render(): void {
    this.status.set('rendering…');
    renderToImageAsync(this.glyphs(), {
      fontFamily: this.family(),
      size: Number(this.size()),
      color: this.textColor(),
      lineHeight:
        this.lineHeight() === '' ? undefined : Number(this.lineHeight()),
    })
      .then(result => {
        this.image.set(result);
        this.status.set('done');
      })
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }
}

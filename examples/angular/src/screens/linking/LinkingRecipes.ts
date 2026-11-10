import { Component, computed, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  resolveRouteFromUrl,
  resolveUrlFromRoute,
} from '@symbiote-native/navigation';
import type { ILinkingConfig } from '@symbiote-native/navigation';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { LINE_COLOR } from '../../navigation-lines';
import {
  APP_LINKING_CONFIG,
  SAMPLE_DEEP_LINK_URL,
} from '../../navigation-linking';
import { recipeById } from '../../navigation-recipes';
import { DEMO_LINKING_CONFIG } from './demo-linking-config';
import { inspectLink, simulatorCommands } from './linking-probe';
import type { IProbeResult } from './linking-probe';

const COLOR = LINE_COLOR.routing;
const LINKS = { resolve: resolveRouteFromUrl, reverse: resolveUrlFromRoute };
const CONFIG_CHOICES = ['app', 'demo'] as const;
type IConfigChoice = (typeof CONFIG_CHOICES)[number];

const CONFIGS: Record<IConfigChoice, ILinkingConfig> = {
  app: APP_LINKING_CONFIG,
  demo: DEMO_LINKING_CONFIG,
};

const EXAMPLES: Record<IConfigChoice, readonly string[]> = {
  app: [
    SAMPLE_DEEP_LINK_URL,
    'https://canary-angular.symbiote-native.dev/header-options',
    'symbiotecanaryangular://tabs',
    'other://details/1',
  ],
  demo: [
    'demo://user/42',
    'demo://user/me',
    'demo://user/a%20b',
    'demo://user/7?ref=push#top',
    'demo://settings/privacy',
    'demo://settings',
    '/settings/account/billing',
  ],
};

const UNMATCHED_TEXT = {
  prefix: 'no match: the link starts with no configured prefix',
  screen: 'no match: the prefix is known, no screen has this path',
} as const;

function describe(result: IProbeResult): string {
  if ('reason' in result) return UNMATCHED_TEXT[result.reason];
  const params =
    result.params === undefined ? 'none' : JSON.stringify(result.params);
  return `screen: ${result.name}\nparams: ${params}\nlink back: ${result.backUrl ?? 'none, a param is missing'}`;
}

@Component({
  selector: 'SimulatorRecipe',
  standalone: true,
  imports: [Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="simulatorRecipe">
      <text testID="deep-link-ios" class="list-row-text">{{
        commands().ios
      }}</text>
      <text testID="deep-link-android" class="list-row-text">{{
        commands().android
      }}</text>
    </Recipe>
  `,
})
export class SimulatorRecipe {
  readonly url = input.required<string>();

  readonly simulatorRecipe = recipeById('linking-simulator');
  readonly commands = computed(() => simulatorCommands(this.url()));
}

@Component({
  selector: 'LinkingRecipes',
  standalone: true,
  imports: [
    ActionButton,
    LabeledChoice,
    Recipe,
    SimulatorRecipe,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <Recipe [recipe]="resolveRecipe">
      <LabeledChoice
        testID="deep-link-config"
        label="config: app is the one wired to the stack"
        [value]="config()"
        [options]="configChoices"
        (valueChange)="pickConfig($event)"
        [color]="color"
      ></LabeledChoice>
      <text class="info-text">prefixes: {{ prefixes() }}</text>
      <text-input
        testID="deep-link-input"
        [value]="url()"
        (valueChange)="url.set($event)"
        [placeholder]="sampleUrl"
        placeholderTextColor="#41506a"
        class="text-input"
      ></text-input>
      <ActionButton
        testID="deep-link-resolve"
        title="Resolve"
        (press)="resolveNow(url())"
        [color]="color"
      ></ActionButton>
      <view class="parity-list">
        <text testID="deep-link-result" class="list-row-text">{{
          resultText()
        }}</text>
      </view>
    </Recipe>
    <Recipe [recipe]="paramsRecipe">
      <text class="note-text">Tap an example to resolve it</text>
      @for (example of examples(); track example) {
        <pressable
          [testID]="'deep-link-example-' + example"
          class="menu-row"
          (press)="resolveNow(example)"
        >
          <text class="menu-row-label">{{ example }}</text>
        </pressable>
      }
    </Recipe>
    <Recipe [recipe]="specificityRecipe">
      <text class="note-text">Config demo, try user/me and user/42</text>
    </Recipe>
    <Recipe [recipe]="nestedRecipe">
      <text class="note-text"
        >Config demo, try settings/privacy and settings</text
      >
    </Recipe>
    <Recipe [recipe]="reverseRecipe">
      <text class="note-text">The link back is printed under every match</text>
    </Recipe>
    <SimulatorRecipe [url]="url()"></SimulatorRecipe>
    <Recipe [recipe]="wiringRecipe">
      <text class="note-text">Wired once at the root, see App</text>
    </Recipe>
  `,
})
export class LinkingRecipes {
  readonly color = COLOR;
  readonly configChoices = CONFIG_CHOICES;
  readonly sampleUrl = SAMPLE_DEEP_LINK_URL;
  readonly resolveRecipe = recipeById('linking-resolve');
  readonly paramsRecipe = recipeById('linking-params');
  readonly specificityRecipe = recipeById('linking-specificity');
  readonly nestedRecipe = recipeById('linking-nested');
  readonly reverseRecipe = recipeById('linking-reverse');
  readonly wiringRecipe = recipeById('linking-wiring');
  readonly config = signal<IConfigChoice>('app');
  readonly url = signal(SAMPLE_DEEP_LINK_URL);
  readonly result = signal<IProbeResult | undefined>(undefined);
  readonly prefixes = computed(() =>
    CONFIGS[this.config()].prefixes.join(' · '),
  );
  readonly examples = computed(() => EXAMPLES[this.config()]);
  readonly resultText = computed(() => {
    const current = this.result();
    return current === undefined
      ? 'tap Resolve to see the parsed route'
      : describe(current);
  });

  pickConfig(choice: IConfigChoice): void {
    this.config.set(choice);
    this.result.set(undefined);
    this.url.set(EXAMPLES[choice][0]);
  }

  resolveNow(link: string): void {
    this.url.set(link);
    this.result.set(inspectLink(LINKS, CONFIGS[this.config()], link));
  }
}

import { useState } from 'react';
import {
  resolveRouteFromUrl,
  resolveUrlFromRoute,
} from '@symbiote-native/navigation';
import type { ILinkingConfig } from '@symbiote-native/navigation';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { LINE_COLOR } from '../../navigation-lines';
import { APP_LINKING_CONFIG, SAMPLE_DEEP_LINK_URL } from '../../navigation-linking';
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
    'https://canary.symbiote-native.dev/header-options',
    'symbiotecanary://tabs',
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
  if (result.kind === 'unmatched') return UNMATCHED_TEXT[result.reason];
  const params = result.params === undefined ? 'none' : JSON.stringify(result.params);
  return `screen: ${result.name}\nparams: ${params}\nlink back: ${result.backUrl ?? 'none, a param is missing'}`;
}

const resolveRecipe = recipeById('linking-resolve');
const simulatorRecipe = recipeById('linking-simulator');
const paramsRecipe = recipeById('linking-params');
const specificityRecipe = recipeById('linking-specificity');
const nestedRecipe = recipeById('linking-nested');
const reverseRecipe = recipeById('linking-reverse');
const wiringRecipe = recipeById('linking-wiring');

function SimulatorRecipe({ url }: { url: string }) {
  const commands = simulatorCommands(url);
  return (
    <Recipe recipe={simulatorRecipe}>
      <text testID="deep-link-ios" className="list-row-text">{commands.ios}</text>
      <text testID="deep-link-android" className="list-row-text">{commands.android}</text>
    </Recipe>
  );
}

export function LinkingRecipes() {
  const [config, setConfig] = useState<IConfigChoice>('app');
  const [url, setUrl] = useState(SAMPLE_DEEP_LINK_URL);
  const [result, setResult] = useState<IProbeResult | undefined>(undefined);
  const resolveNow = (link: string) => {
    setUrl(link);
    setResult(inspectLink(LINKS, CONFIGS[config], link));
  };
  return (
    <>
      <Recipe recipe={resolveRecipe}>
        <LabeledChoice
          testID="deep-link-config"
          label="config: app is the one wired to the stack"
          value={config}
          options={CONFIG_CHOICES}
          onChange={choice => {
            setConfig(choice);
            setResult(undefined);
            setUrl(EXAMPLES[choice][0]);
          }}
          color={COLOR}
        />
        <text className="info-text">
          {`prefixes: ${CONFIGS[config].prefixes.join(' · ')}`}
        </text>
        <text-input
          testID="deep-link-input"
          value={url}
          onValueChange={event => setUrl(event.text)}
          placeholder={SAMPLE_DEEP_LINK_URL}
          placeholderTextColor="#41506a"
          className="text-input"
        />
        <ActionButton
          testID="deep-link-resolve"
          title="Resolve"
          onPress={() => resolveNow(url)}
          color={COLOR}
        />
        <view className="parity-list">
          <text testID="deep-link-result" className="list-row-text">
            {result === undefined ? 'tap Resolve to see the parsed route' : describe(result)}
          </text>
        </view>
      </Recipe>
      <Recipe recipe={paramsRecipe}>
        <text className="note-text">Tap an example to resolve it</text>
        {EXAMPLES[config].map(example => (
          <pressable
            key={example}
            testID={`deep-link-example-${example}`}
            className="menu-row"
            onPress={() => resolveNow(example)}
          >
            <text className="menu-row-label">{example}</text>
          </pressable>
        ))}
      </Recipe>
      <Recipe recipe={specificityRecipe}>
        <text className="note-text">Config demo, try user/me and user/42</text>
      </Recipe>
      <Recipe recipe={nestedRecipe}>
        <text className="note-text">Config demo, try settings/privacy and settings</text>
      </Recipe>
      <Recipe recipe={reverseRecipe}>
        <text className="note-text">The link back is printed under every match</text>
      </Recipe>
      <SimulatorRecipe url={url} />
      <Recipe recipe={wiringRecipe}>
        <text className="note-text">Wired once at the root, see App</text>
      </Recipe>
    </>
  );
}

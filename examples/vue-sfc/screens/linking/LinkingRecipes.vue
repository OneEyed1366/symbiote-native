<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  resolveRouteFromUrl,
  resolveUrlFromRoute,
} from '@symbiote-native/navigation';
import type { ILinkingConfig } from '@symbiote-native/navigation';
import ActionButton from '../../components/ActionButton.vue';
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
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
    'symbiotecanaryvuesfc://tabs',
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

// Only an unmatched result carries a `reason`
function describe(probe: IProbeResult): string {
  if ('reason' in probe) return UNMATCHED_TEXT[probe.reason];
  const params = probe.params === undefined ? 'none' : JSON.stringify(probe.params);
  return `screen: ${probe.name}\nparams: ${params}\nlink back: ${probe.backUrl ?? 'none, a param is missing'}`;
}

const resolveRecipe = recipeById('linking-resolve');
const simulatorRecipe = recipeById('linking-simulator');
const paramsRecipe = recipeById('linking-params');
const specificityRecipe = recipeById('linking-specificity');
const nestedRecipe = recipeById('linking-nested');
const reverseRecipe = recipeById('linking-reverse');
const wiringRecipe = recipeById('linking-wiring');

const config = ref<IConfigChoice>('app');
const url = ref(SAMPLE_DEEP_LINK_URL);
const result = ref<IProbeResult | undefined>(undefined);
const commands = computed(() => simulatorCommands(url.value));

function resolveNow(link: string) {
  url.value = link;
  result.value = inspectLink(LINKS, CONFIGS[config.value], link);
}

function chooseConfig(choice: IConfigChoice) {
  config.value = choice;
  result.value = undefined;
  url.value = EXAMPLES[choice][0];
}
</script>

<template>
  <Recipe :recipe="resolveRecipe">
    <LabeledChoice
      testID="deep-link-config"
      label="config: app is the one wired to the stack"
      :value="config"
      :options="CONFIG_CHOICES"
      :onChange="chooseConfig"
      :color="COLOR"
    />
    <text class="info-text">
      {{ `prefixes: ${CONFIGS[config].prefixes.join(' · ')}` }}
    </text>
    <text-input
      v-model="url"
      testID="deep-link-input"
      :placeholder="SAMPLE_DEEP_LINK_URL"
      placeholderTextColor="#41506a"
      class="text-input"
    />
    <ActionButton
      testID="deep-link-resolve"
      title="Resolve"
      :onPress="() => resolveNow(url)"
      :color="COLOR"
    />
    <view class="parity-list">
      <text testID="deep-link-result" class="list-row-text">
        {{
          result === undefined
            ? 'tap Resolve to see the parsed route'
            : describe(result)
        }}
      </text>
    </view>
  </Recipe>
  <Recipe :recipe="paramsRecipe">
    <text class="note-text">Tap an example to resolve it</text>
    <pressable
      v-for="example in EXAMPLES[config]"
      :key="example"
      :testID="`deep-link-example-${example}`"
      class="menu-row"
      @press="resolveNow(example)"
    >
      <text class="menu-row-label">{{ example }}</text>
    </pressable>
  </Recipe>
  <Recipe :recipe="specificityRecipe">
    <text class="note-text">Config demo, try user/me and user/42</text>
  </Recipe>
  <Recipe :recipe="nestedRecipe">
    <text class="note-text">Config demo, try settings/privacy and settings</text>
  </Recipe>
  <Recipe :recipe="reverseRecipe">
    <text class="note-text">The link back is printed under every match</text>
  </Recipe>
  <Recipe :recipe="simulatorRecipe">
    <text testID="deep-link-ios" class="list-row-text">{{ commands.ios }}</text>
    <text testID="deep-link-android" class="list-row-text">
      {{ commands.android }}
    </text>
  </Recipe>
  <Recipe :recipe="wiringRecipe">
    <text class="note-text">Wired once at the root, see App</text>
  </Recipe>
</template>

import { defineComponent, ref } from 'vue';
import { useTabNavigation } from '@symbiote-native/navigation/vue';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { useTabsPanel } from './tabs-panel';
import {
  ACTIVE_CHOICES,
  BADGE_CHOICES,
  BAR_CHOICES,
  ICON_CHOICES,
  INACTIVE_CHOICES,
  LABEL_CHOICES,
  TAB_NAMES,
} from './tabs-settings';

const COLOR = LINE_COLOR.structure;
const iconRecipe = recipeById('tabs-icon-badge');
const tintRecipe = recipeById('tabs-tint');
const barRecipe = recipeById('tabs-bar-style');
const labelRecipe = recipeById('tabs-label');
const resetRecipe = recipeById('tabs-state-reset');
const jumpRecipe = recipeById('tabs-jump');

export const TabBarRecipes = defineComponent(
  () => {
    const { settings, update } = useTabsPanel();
    return () => (
      <>
        <Recipe recipe={iconRecipe}>
          <LabeledChoice
            testID="tabs-icon"
            label="tabBarIcon"
            value={settings.value.icon}
            options={ICON_CHOICES}
            onChange={icon => update({ icon })}
            color={COLOR}
          />
          <LabeledChoice
            testID="tabs-badge"
            label="tabBarBadge on Search"
            value={settings.value.badge}
            options={BADGE_CHOICES}
            onChange={badge => update({ badge })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={tintRecipe}>
          <LabeledChoice
            testID="tabs-active"
            label="tabBarActiveTintColor"
            value={settings.value.activeTint}
            options={ACTIVE_CHOICES}
            onChange={activeTint => update({ activeTint })}
            color={COLOR}
          />
          <LabeledChoice
            testID="tabs-inactive"
            label="tabBarInactiveTintColor"
            value={settings.value.inactiveTint}
            options={INACTIVE_CHOICES}
            onChange={inactiveTint => update({ inactiveTint })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={barRecipe}>
          <LabeledChoice
            testID="tabs-bar"
            label="tabBarStyle"
            value={settings.value.bar}
            options={BAR_CHOICES}
            onChange={bar => update({ bar })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={labelRecipe}>
          <LabeledChoice
            testID="tabs-label"
            label="what names the tab"
            value={settings.value.label}
            options={LABEL_CHOICES}
            onChange={label => update({ label })}
            color={COLOR}
          />
        </Recipe>
      </>
    );
  },
  { name: 'TabBarRecipes' },
);

// One counter dies with its tab, the other lives in the panel above the `Tab`
export const StateRecipe = defineComponent(
  () => {
    const { settings, update } = useTabsPanel();
    const localCount = ref(0);
    return () => (
      <Recipe recipe={resetRecipe}>
        <ActionButton
          testID="tabs-local-count"
          title={`Local counter: ${localCount.value}`}
          onPress={() => {
            localCount.value += 1;
          }}
          color={COLOR}
        />
        <ActionButton
          testID="tabs-lifted-count"
          title={`Counter above the Tab: ${settings.value.liftedCount}`}
          onPress={() => update({ liftedCount: settings.value.liftedCount + 1 })}
          color={COLOR}
        />
      </Recipe>
    );
  },
  { name: 'StateRecipe' },
);

export const JumpRecipe = defineComponent(
  () => {
    const { settings, update } = useTabsPanel();
    const tabs = useTabNavigation();
    return () => (
      <Recipe recipe={jumpRecipe}>
        <LabeledChoice
          testID="tabs-initial"
          label="initialRouteName (remounts the bar)"
          value={settings.value.initial}
          options={TAB_NAMES}
          onChange={initial => update({ initial })}
          color={COLOR}
        />
        {TAB_NAMES.filter(name => name !== 'Home').map(name => (
          <ActionButton
            key={name}
            testID={`tabs-jump-${name}`}
            title={`jumpTo ${name} with a param`}
            onPress={() => tabs.value.jumpTo(name, { from: 'Home' })}
            color={COLOR}
          />
        ))}
      </Recipe>
    );
  },
  { name: 'JumpRecipe' },
);

import { createSignal, For, onCleanup } from 'solid-js';
import {
  compatibilityFlags,
  enableScreens,
  featureFlags,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/solid';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { Platform } from '@symbiote-native/solid';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { configRows, readIsLegacyInset } from './runtime-config';
import type { IConfigRow } from './runtime-config';

const COLOR = LINE_COLOR.introspection;
const enableRecipe = recipeById('runtime-enable-screens');
const featureRecipe = recipeById('runtime-feature-flags');
const compatRecipe = recipeById('runtime-compat-flags');
const searchRecipe = recipeById('runtime-search-bar');
const legacyRecipe = recipeById('runtime-legacy-inset');
const backRecipe = recipeById('runtime-native-back');

function ConfigRowView(props: { row: IConfigRow }) {
  return (
    <view testID={`runtime-row-${props.row.name}`}>
      <text class="list-row-text">{`${props.row.name}: ${props.row.value}`}</text>
      <text class="info-text">{props.row.note}</text>
    </view>
  );
}

function rowsOfGroups(groups: readonly IConfigRow['group'][]) {
  return configRows({
    experiment: featureFlags.experiment,
    stable: featureFlags.stable,
    compatibility: compatibilityFlags,
    isSearchBarAvailable: isSearchBarAvailableForCurrentPlatform,
    areScreensEnabled: screensEnabled(),
  }).filter(row => groups.includes(row.group));
}

function EnableScreensRecipe() {
  const [areScreensOn, setAreScreensOn] = createSignal(screensEnabled());
  // The switch is app-wide, so leaving the screen puts the value it found back
  const initial = screensEnabled();
  onCleanup(() => enableScreens(initial));
  const viewName = resolveScreenContainerViewName({
    hasTwoStates: false,
    os: Platform.OS,
  });
  return (
    <Recipe recipe={enableRecipe}>
      <SwitchRow
        testID="runtime-enable-screens"
        label="enableScreens"
        value={areScreensOn()}
        onChange={value => {
          enableScreens(value);
          setAreScreensOn(value);
        }}
        color={COLOR}
      />
      <text testID="runtime-container-view" class="info-text">
        {`a container without enabled draws: ${viewName}`}
      </text>
    </Recipe>
  );
}

function LegacyInsetRecipe() {
  const route = useRoute();
  const navigation = useStackNavigation();
  return (
    <Recipe recipe={legacyRecipe}>
      <SwitchRow
        testID="runtime-legacy-inset"
        label="headerLegacyTopInsetBehavior"
        value={readIsLegacyInset(route().params)}
        onChange={isOn => navigation().setParams({ isLegacyInset: isOn })}
        color={COLOR}
      />
    </Recipe>
  );
}

// The global switches of the screens library, read live: nothing here is a copy
export function RuntimeRecipes() {
  return (
    <>
      <EnableScreensRecipe />
      <Recipe recipe={featureRecipe}>
        <For each={rowsOfGroups(['experiment', 'stable'])}>
          {row => <ConfigRowView row={row} />}
        </For>
      </Recipe>
      <Recipe recipe={compatRecipe}>
        <For each={rowsOfGroups(['compatibility'])}>
          {row => <ConfigRowView row={row} />}
        </For>
      </Recipe>
      <Recipe recipe={searchRecipe}>
        <For
          each={rowsOfGroups(['platform']).filter(row =>
            row.name.includes('SearchBar'),
          )}
        >
          {row => <ConfigRowView row={row} />}
        </For>
      </Recipe>
      <LegacyInsetRecipe />
      <Recipe recipe={backRecipe}>
        <text class="info-text">executeNativeBackPress() has no button here.</text>
      </Recipe>
    </>
  );
}

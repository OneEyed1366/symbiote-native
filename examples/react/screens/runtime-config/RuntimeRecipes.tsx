import { useEffect, useState } from 'react';
import {
  compatibilityFlags,
  enableScreens,
  featureFlags,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/react';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { Platform } from '@symbiote-native/react';
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

function ConfigRowView({ row }: { row: IConfigRow }) {
  return (
    <view testID={`runtime-row-${row.name}`}>
      <text className="list-row-text">{`${row.name}: ${row.value}`}</text>
      <text className="info-text">{row.note}</text>
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
  const [areScreensOn, setAreScreensOn] = useState(screensEnabled);
  // The switch is app-wide, so leaving the screen puts the value it found back
  useEffect(() => {
    const initial = screensEnabled();
    return () => enableScreens(initial);
  }, []);
  const viewName = resolveScreenContainerViewName({
    hasTwoStates: false,
    os: Platform.OS,
  });
  return (
    <Recipe recipe={enableRecipe}>
      <SwitchRow
        testID="runtime-enable-screens"
        label="enableScreens"
        value={areScreensOn}
        onChange={value => {
          enableScreens(value);
          setAreScreensOn(value);
        }}
        color={COLOR}
      />
      <text testID="runtime-container-view" className="info-text">
        {`a container without enabled draws: ${viewName}`}
      </text>
    </Recipe>
  );
}

function LegacyInsetRecipe() {
  const isLegacyInset = readIsLegacyInset(useRoute().params);
  const navigation = useStackNavigation();
  return (
    <Recipe recipe={legacyRecipe}>
      <SwitchRow
        testID="runtime-legacy-inset"
        label="headerLegacyTopInsetBehavior"
        value={isLegacyInset}
        onChange={isOn => navigation.setParams({ isLegacyInset: isOn })}
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
        {rowsOfGroups(['experiment', 'stable']).map(row => (
          <ConfigRowView key={row.name} row={row} />
        ))}
      </Recipe>
      <Recipe recipe={compatRecipe}>
        {rowsOfGroups(['compatibility']).map(row => (
          <ConfigRowView key={row.name} row={row} />
        ))}
      </Recipe>
      <Recipe recipe={searchRecipe}>
        {rowsOfGroups(['platform'])
          .filter(row => row.name !== 'screensEnabled()')
          .map(row => (
            <ConfigRowView key={row.name} row={row} />
          ))}
      </Recipe>
      <LegacyInsetRecipe />
      <Recipe recipe={backRecipe}>
        <text className="info-text">executeNativeBackPress() has no button here.</text>
      </Recipe>
    </>
  );
}

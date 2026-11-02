<script lang="ts">
  import { useRoute } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { isParamsRecord, readText } from '../read-params';
  import { useRouteSettings } from '../use-route-settings.svelte';
  import {
    AUTO_CAPITALIZE,
    CANCEL_TEXTS,
    COLOR_THEMES,
    INPUT_TYPES,
    PLACEMENTS,
    readHeaderOptionsSettings,
  } from './header-options-settings';
  import { searchBarRef } from './search-bar-ref';

  const COLOR = LINE_COLOR.presentation;
  const placementRecipe = recipeById('header-options-placement');
  const behaviorRecipe = recipeById('header-options-search-behavior');
  const colorsRecipe = recipeById('header-options-search-colors');
  const androidRecipe = recipeById('header-options-android');
  const eventsRecipe = recipeById('header-options-search-events');
  const commandsRecipe = recipeById('header-options-search-commands');
  const PRESET_TEXT = 'preset value';

  // Placement and the knobs of the search bar, then what it reported and the commands that drive it
  const search = useRouteSettings(readHeaderOptionsSettings);
  const route = useRoute();
  const last = $derived.by(() => {
    const record = isParamsRecord(route.current.params)
      ? route.current.params
      : {};
    return {
      text: readText(record, 'lastSearchText', ''),
      submitted: readText(record, 'lastSearchSubmitted', ''),
      event: readText(record, 'lastSearchBarEvent', ''),
    };
  });
</script>

<Recipe recipe={placementRecipe}>
  <LabeledChoice
    testID="search-placement"
    label="placement"
    value={search.settings.placement}
    options={PLACEMENTS}
    onChange={placement => search.update({ placement })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={behaviorRecipe}>
  <SwitchRow
    testID="search-hide-when-scrolling"
    label="hideWhenScrolling"
    value={search.settings.isHideWhenScrolling}
    onChange={isHideWhenScrolling => search.update({ isHideWhenScrolling })}
    color={COLOR}
  />
  <SwitchRow
    testID="search-obscure-background"
    label="obscureBackground"
    value={search.settings.isObscureBackground}
    onChange={isObscureBackground => search.update({ isObscureBackground })}
    color={COLOR}
  />
  <SwitchRow
    testID="search-hide-navigation-bar"
    label="hideNavigationBar"
    value={search.settings.isHideNavigationBar}
    onChange={isHideNavigationBar => search.update({ isHideNavigationBar })}
    color={COLOR}
  />
  <SwitchRow
    testID="search-auto-focus"
    label="autoFocus"
    value={search.settings.isAutoFocus}
    onChange={isAutoFocus => search.update({ isAutoFocus })}
    color={COLOR}
  />
  <SwitchRow
    testID="search-toolbar-integration"
    label="allowToolbarIntegration"
    value={search.settings.isAllowToolbarIntegration}
    onChange={isAllowToolbarIntegration =>
      search.update({ isAllowToolbarIntegration })}
    color={COLOR}
  />
  <LabeledChoice
    testID="search-auto-capitalize"
    label="autoCapitalize"
    value={search.settings.autoCapitalize}
    options={AUTO_CAPITALIZE}
    onChange={autoCapitalize => search.update({ autoCapitalize })}
    color={COLOR}
  />
  <LabeledChoice
    testID="search-cancel-text"
    label="cancelButtonText"
    value={search.settings.cancelText}
    options={CANCEL_TEXTS}
    onChange={cancelText => search.update({ cancelText })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={colorsRecipe}>
  <LabeledChoice
    testID="search-color-theme"
    label="colour theme of the field"
    value={search.settings.colorTheme}
    options={COLOR_THEMES}
    onChange={colorTheme => search.update({ colorTheme })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={androidRecipe}>
  <LabeledChoice
    testID="search-input-type"
    label="inputType"
    value={search.settings.inputType}
    options={INPUT_TYPES}
    onChange={inputType => search.update({ inputType })}
    color={COLOR}
  />
  <SwitchRow
    testID="search-hint-icon"
    label="shouldShowHintSearchIcon"
    value={search.settings.isShowHintSearchIcon}
    onChange={isShowHintSearchIcon => search.update({ isShowHintSearchIcon })}
    color={COLOR}
  />
  <SwitchRow
    testID="search-back-override"
    label="disableBackButtonOverride"
    value={search.settings.isDisableBackButtonOverride}
    onChange={isDisableBackButtonOverride =>
      search.update({ isDisableBackButtonOverride })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={eventsRecipe}>
  <text testID="header-search-text" class="info-text">
    {`last search text: ${last.text || 'none yet, pull down and type'}`}
  </text>
  <text testID="header-search-submitted" class="info-text">
    {`last search submitted: ${last.submitted || 'none yet, type and press search'}`}
  </text>
  <text testID="header-search-event" class="info-text">
    {`last search bar event: ${last.event || 'none yet, focus or cancel the search bar'}`}
  </text>
</Recipe>
<Recipe recipe={commandsRecipe}>
  <ActionButton
    testID="search-bar-focus"
    title="focus()"
    onPress={() => searchBarRef.current?.focus()}
    color={COLOR}
  />
  <ActionButton
    testID="search-bar-blur"
    title="blur()"
    onPress={() => searchBarRef.current?.blur()}
    color={COLOR}
  />
  <ActionButton
    testID="search-bar-set-text"
    title={`setText('${PRESET_TEXT}')`}
    onPress={() => searchBarRef.current?.setText(PRESET_TEXT)}
    color={COLOR}
  />
  <ActionButton
    testID="search-bar-clear"
    title="clearText()"
    onPress={() => searchBarRef.current?.clearText()}
    color={COLOR}
  />
  <ActionButton
    testID="search-bar-cancel"
    title="cancelSearch()"
    onPress={() => searchBarRef.current?.cancelSearch()}
    color={COLOR}
  />
  <ActionButton
    testID="search-bar-show-cancel"
    title="toggleCancelButton(true)"
    onPress={() => searchBarRef.current?.toggleCancelButton(true)}
    color={COLOR}
  />
</Recipe>

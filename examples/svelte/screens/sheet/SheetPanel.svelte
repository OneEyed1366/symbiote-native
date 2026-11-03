<script lang="ts">
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { ROUTE_NAME } from '../../routes';
  import { useRouteSettings } from '../use-route-settings.svelte';
  import {
    CONTENT_STYLES,
    DETENT_CHOICES,
    ELEVATION_CHOICES,
    INITIAL_CHOICES,
    RADIUS_CHOICES,
    readSheetSettings,
    sheetParamsOf,
    UNDIMMED_CHOICES,
  } from './sheet-settings';
  import { createSheetLines, sheetLog } from './use-sheet-log';

  const COLOR = LINE_COLOR.presentation;
  const detentsRecipe = recipeById('sheet-detents');
  const initialRecipe = recipeById('sheet-initial');
  const undimmedRecipe = recipeById('sheet-undimmed');
  const grabberRecipe = recipeById('sheet-grabber');
  const expandRecipe = recipeById('sheet-expand-scroll');
  const contentRecipe = recipeById('sheet-content-style');
  const eventsRecipe = recipeById('sheet-events');
  const footerRecipe = recipeById('sheet-footer');
  const androidRecipe = recipeById('sheet-android');
  const stackingRecipe = recipeById('sheet-stacking');

  // Each recipe edits the panel, any "Present" button opens a sheet with the whole panel applied
  const sheet = useRouteSettings(readSheetSettings);
  const lines = createSheetLines();
  let count = $state(0);

  function present() {
    sheet.navigation.current.push(
      ROUTE_NAME.SheetDemo,
      sheetParamsOf(sheet.settings),
    );
  }
</script>

<!-- The counter sits first on the screen: it is what stays tappable behind an undimmed sheet -->
<ActionButton
  testID="sheet-background-counter"
  title={`Background counter: ${count}`}
  onPress={() => (count += 1)}
  color={COLOR}
/>
<Recipe recipe={detentsRecipe}>
  <LabeledChoice
    testID="sheet-detents"
    label="sheetAllowedDetents"
    value={sheet.settings.detents}
    options={DETENT_CHOICES}
    onChange={detents => sheet.update({ detents })}
    color={COLOR}
  />
  {@render presentButton('sheet-present')}
</Recipe>
<Recipe recipe={initialRecipe}>
  <LabeledChoice
    testID="sheet-initial"
    label="sheetInitialDetentIndex"
    value={sheet.settings.initialDetent}
    options={INITIAL_CHOICES}
    onChange={initialDetent => sheet.update({ initialDetent })}
    color={COLOR}
  />
  {@render presentButton('sheet-present-initial')}
</Recipe>
<Recipe recipe={undimmedRecipe}>
  <LabeledChoice
    testID="sheet-undimmed"
    label="sheetLargestUndimmedDetentIndex"
    value={sheet.settings.undimmed}
    options={UNDIMMED_CHOICES}
    onChange={undimmed => sheet.update({ undimmed })}
    color={COLOR}
  />
  {@render presentButton('sheet-present-undimmed')}
</Recipe>
<Recipe recipe={grabberRecipe}>
  <SwitchRow
    testID="sheet-grabber"
    label="sheetGrabberVisible"
    value={sheet.settings.isGrabberVisible}
    onChange={isGrabberVisible => sheet.update({ isGrabberVisible })}
    color={COLOR}
  />
  <LabeledChoice
    testID="sheet-radius"
    label="sheetCornerRadius"
    value={sheet.settings.cornerRadius}
    options={RADIUS_CHOICES}
    onChange={cornerRadius => sheet.update({ cornerRadius })}
    color={COLOR}
  />
  {@render presentButton('sheet-present-grabber')}
</Recipe>
<Recipe recipe={expandRecipe}>
  <SwitchRow
    testID="sheet-expand"
    label="sheetExpandsWhenScrolledToEdge"
    value={sheet.settings.isExpandsOnScroll}
    onChange={isExpandsOnScroll => sheet.update({ isExpandsOnScroll })}
    color={COLOR}
  />
  {@render presentButton('sheet-present-expand')}
</Recipe>
<Recipe recipe={contentRecipe}>
  <LabeledChoice
    testID="sheet-content-style"
    label="contentStyle"
    value={sheet.settings.contentStyle}
    options={CONTENT_STYLES}
    onChange={contentStyle => sheet.update({ contentStyle })}
    color={COLOR}
  />
  {@render presentButton('sheet-present-content')}
</Recipe>
<Recipe recipe={eventsRecipe}>
  {#if lines.current.length > 0}
    {#each lines.current as line, index (index)}
      <text testID={`sheet-log-line-${index}`} class="list-row-text">
        {line.count > 1 ? `${line.text} x${line.count}` : line.text}
      </text>
    {/each}
  {:else}
    <text class="info-text">
      No sheet event yet, present a sheet and drag it
    </text>
  {/if}
  <ActionButton
    testID="sheet-log-clear"
    title="Clear log"
    onPress={sheetLog.clear}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={footerRecipe}>
  <SwitchRow
    testID="sheet-footer"
    label="sheetFooter"
    value={sheet.settings.hasFooter}
    onChange={hasFooter => sheet.update({ hasFooter })}
    color={COLOR}
  />
  {@render presentButton('sheet-present-footer')}
</Recipe>
<Recipe recipe={androidRecipe}>
  <LabeledChoice
    testID="sheet-elevation"
    label="sheetElevation"
    value={sheet.settings.elevation}
    options={ELEVATION_CHOICES}
    onChange={elevation => sheet.update({ elevation })}
    color={COLOR}
  />
  <SwitchRow
    testID="sheet-overflow"
    label="sheetShouldOverflowTopInset"
    value={sheet.settings.isOverflowTopInset}
    onChange={isOverflowTopInset => sheet.update({ isOverflowTopInset })}
    color={COLOR}
  />
  <SwitchRow
    testID="sheet-resize-animation"
    label="sheetDefaultResizeAnimationEnabled"
    value={sheet.settings.isDefaultResizeAnimation}
    onChange={isDefaultResizeAnimation =>
      sheet.update({ isDefaultResizeAnimation })}
    color={COLOR}
  />
  {@render presentButton('sheet-present-android')}
</Recipe>
<Recipe recipe={stackingRecipe}>
  <text class="info-text">
    Present a sheet, then use Present another sheet inside it.
  </text>
</Recipe>

{#snippet presentButton(testID: string)}
  <ActionButton
    {testID}
    title="Present a sheet"
    onPress={present}
    color={COLOR}
  />
{/snippet}

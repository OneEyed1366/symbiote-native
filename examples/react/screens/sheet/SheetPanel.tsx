import { useState } from 'react';
import { ROUTE_NAME } from '../../routes';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { useRouteSettings } from '../use-route-settings';
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
import { sheetLog, useSheetLines } from './use-sheet-log';

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

// The counter sits first on the screen: it is what stays tappable behind an undimmed sheet
function BackgroundCounter() {
  const [count, setCount] = useState(0);
  return (
    <ActionButton
      testID="sheet-background-counter"
      title={`Background counter: ${count}`}
      onPress={() => setCount(count + 1)}
      color={COLOR}
    />
  );
}

function SheetLog() {
  const lines = useSheetLines();
  return (
    <>
      {lines.length === 0 ? (
        <text className="info-text">No sheet event yet, present a sheet and drag it</text>
      ) : (
        lines.map((line, index) => (
          <text key={line.id} testID={`sheet-log-line-${index}`} className="list-row-text">
            {line.count > 1 ? `${line.text} x${line.count}` : line.text}
          </text>
        ))
      )}
      <ActionButton
        testID="sheet-log-clear"
        title="Clear log"
        onPress={sheetLog.clear}
        color={COLOR}
      />
    </>
  );
}

// Each recipe edits the panel, any "Present" button opens a sheet with the whole panel applied
export function SheetPanel() {
  const { settings, update, navigation } = useRouteSettings(readSheetSettings);
  const present = () =>
    navigation.push(ROUTE_NAME.SheetDemo, sheetParamsOf(settings));
  const presentButton = (testID: string) => (
    <ActionButton testID={testID} title="Present a sheet" onPress={present} color={COLOR} />
  );
  return (
    <>
      <BackgroundCounter />
      <Recipe recipe={detentsRecipe}>
        <LabeledChoice
          testID="sheet-detents"
          label="sheetAllowedDetents"
          value={settings.detents}
          options={DETENT_CHOICES}
          onChange={detents => update({ detents })}
          color={COLOR}
        />
        {presentButton('sheet-present')}
      </Recipe>
      <Recipe recipe={initialRecipe}>
        <LabeledChoice
          testID="sheet-initial"
          label="sheetInitialDetentIndex"
          value={settings.initialDetent}
          options={INITIAL_CHOICES}
          onChange={initialDetent => update({ initialDetent })}
          color={COLOR}
        />
        {presentButton('sheet-present-initial')}
      </Recipe>
      <Recipe recipe={undimmedRecipe}>
        <LabeledChoice
          testID="sheet-undimmed"
          label="sheetLargestUndimmedDetentIndex"
          value={settings.undimmed}
          options={UNDIMMED_CHOICES}
          onChange={undimmed => update({ undimmed })}
          color={COLOR}
        />
        {presentButton('sheet-present-undimmed')}
      </Recipe>
      <Recipe recipe={grabberRecipe}>
        <SwitchRow
          testID="sheet-grabber"
          label="sheetGrabberVisible"
          value={settings.isGrabberVisible}
          onChange={isGrabberVisible => update({ isGrabberVisible })}
          color={COLOR}
        />
        <LabeledChoice
          testID="sheet-radius"
          label="sheetCornerRadius"
          value={settings.cornerRadius}
          options={RADIUS_CHOICES}
          onChange={cornerRadius => update({ cornerRadius })}
          color={COLOR}
        />
        {presentButton('sheet-present-grabber')}
      </Recipe>
      <Recipe recipe={expandRecipe}>
        <SwitchRow
          testID="sheet-expand"
          label="sheetExpandsWhenScrolledToEdge"
          value={settings.isExpandsOnScroll}
          onChange={isExpandsOnScroll => update({ isExpandsOnScroll })}
          color={COLOR}
        />
        {presentButton('sheet-present-expand')}
      </Recipe>
      <Recipe recipe={contentRecipe}>
        <LabeledChoice
          testID="sheet-content-style"
          label="contentStyle"
          value={settings.contentStyle}
          options={CONTENT_STYLES}
          onChange={contentStyle => update({ contentStyle })}
          color={COLOR}
        />
        {presentButton('sheet-present-content')}
      </Recipe>
      <Recipe recipe={eventsRecipe}>
        <SheetLog />
      </Recipe>
      <Recipe recipe={footerRecipe}>
        <SwitchRow
          testID="sheet-footer"
          label="sheetFooter"
          value={settings.hasFooter}
          onChange={hasFooter => update({ hasFooter })}
          color={COLOR}
        />
        {presentButton('sheet-present-footer')}
      </Recipe>
      <Recipe recipe={androidRecipe}>
        <LabeledChoice
          testID="sheet-elevation"
          label="sheetElevation"
          value={settings.elevation}
          options={ELEVATION_CHOICES}
          onChange={elevation => update({ elevation })}
          color={COLOR}
        />
        <SwitchRow
          testID="sheet-overflow"
          label="sheetShouldOverflowTopInset"
          value={settings.isOverflowTopInset}
          onChange={isOverflowTopInset => update({ isOverflowTopInset })}
          color={COLOR}
        />
        <SwitchRow
          testID="sheet-resize-animation"
          label="sheetDefaultResizeAnimationEnabled"
          value={settings.isDefaultResizeAnimation}
          onChange={isDefaultResizeAnimation => update({ isDefaultResizeAnimation })}
          color={COLOR}
        />
        {presentButton('sheet-present-android')}
      </Recipe>
      <Recipe recipe={stackingRecipe}>
        <text className="info-text">
          Present a sheet, then use Present another sheet inside it.
        </text>
      </Recipe>
    </>
  );
}

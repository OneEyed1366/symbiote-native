import { Show } from 'solid-js';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import {
  ANIMATIONS,
  DURATIONS,
  PRESENTATIONS,
  REPLACE_ANIMATIONS,
  timedPanelOf,
} from './probe';
import { useProbe } from './use-probe';

const COLOR = LINE_COLOR.routing;
const presentationRecipe = recipeById('stack-presentation');
const animationRecipe = recipeById('stack-animation');
const durationRecipe = recipeById('stack-duration');
const replaceRecipe = recipeById('stack-replace-animation');

// iOS times only some pairs, so the push of this recipe picks one of them
function DurationRecipe() {
  const { panel, update, actions } = useProbe();
  const timed = () => timedPanelOf(panel());
  return (
    <Recipe recipe={durationRecipe}>
      <LabeledChoice
        testID="stack-duration"
        label="transitionDuration (ms)"
        value={panel().nextDuration}
        options={DURATIONS}
        onChange={nextDuration => update({ nextDuration })}
        color={COLOR}
      />
      <text class="info-text">
        {`Pushes as ${timed().nextPresentation} with ${timed().nextAnimation}, the pair iOS can time`}
      </text>
      <ActionButton
        testID="stack-push-duration"
        title="Push a timed probe"
        onPress={actions.pushTimedProbe}
        color={COLOR}
      />
    </Recipe>
  );
}

// Each choice is for the next probe, the probe keeps it as its own entry transition
export function PresentationRecipes() {
  const { panel, update, probe, actions } = useProbe();
  const { pushProbe, replaceWithProbe } = actions;
  return (
    <>
      <Recipe recipe={presentationRecipe}>
        <LabeledChoice
          testID="stack-presentation"
          label="stackPresentation"
          value={panel().nextPresentation}
          options={PRESENTATIONS}
          onChange={nextPresentation => update({ nextPresentation })}
          color={COLOR}
        />
        <ActionButton
          testID="stack-push-presentation"
          title="Push a probe"
          onPress={pushProbe}
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={animationRecipe}>
        <LabeledChoice
          testID="stack-animation"
          label="stackAnimation"
          value={panel().nextAnimation}
          options={ANIMATIONS}
          onChange={nextAnimation => update({ nextAnimation })}
          color={COLOR}
        />
        <ActionButton
          testID="stack-push-animation"
          title="Push a probe"
          onPress={pushProbe}
          color={COLOR}
        />
      </Recipe>
      <DurationRecipe />

      <Recipe recipe={replaceRecipe}>
        <LabeledChoice
          testID="stack-replace-animation"
          label="replaceAnimation"
          value={panel().nextReplaceAnimation}
          options={REPLACE_ANIMATIONS}
          onChange={nextReplaceAnimation => update({ nextReplaceAnimation })}
          color={COLOR}
        />
        <Show
          when={probe().isProbe}
          fallback={
            <text class="info-text">
              Push a probe first, replace swaps the top one
            </text>
          }
        >
          <ActionButton
            testID="stack-replace"
            title="Replace this probe"
            onPress={replaceWithProbe}
            color={COLOR}
          />
        </Show>
      </Recipe>
    </>
  );
}

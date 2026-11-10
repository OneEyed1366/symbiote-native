import { defineComponent, ref } from 'vue';
import {
  deserializeNavigatorState,
  serializeNavigatorState,
} from '@symbiote-native/navigation';
import type { INavigatorState } from '@symbiote-native/navigation';
import {
  useNavigationState,
  useStackNavigation,
} from '@symbiote-native/navigation/vue';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import {
  breakSnapshot,
  PRESET_CHOICES,
  presetState,
} from './persistence-presets';
import { snapshotStore, useSnapshot } from './use-snapshot';

const setSnapshot = snapshotStore.set;

const COLOR = LINE_COLOR.routing;
const EMPTY_TEXT = 'tap Serialize to capture the current route stack as JSON';
const saveRecipe = recipeById('persist-save');
const restoreRecipe = recipeById('persist-restore');
const invalidRecipe = recipeById('persist-invalid');
const resetRecipe = recipeById('persist-reset');

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'restore failed';
}

export const PersistenceRecipes = defineComponent(
  () => {
    const navigation = useStackNavigation();
    const state = useNavigationState<INavigatorState>(current => current);
    const snapshot = useSnapshot();
    const error = ref<string | undefined>(undefined);
    const preset = ref<(typeof PRESET_CHOICES)[number]>('details');

    const serialize = () => {
      error.value = undefined;
      setSnapshot(JSON.stringify(serializeNavigatorState(state.value), null, 2));
    };
    const restore = () => {
      if (snapshot.value === undefined) return;
      try {
        const parsed: unknown = JSON.parse(snapshot.value);
        navigation.value.reset(deserializeNavigatorState(parsed));
        error.value = undefined;
      } catch (thrown) {
        error.value = errorText(thrown);
      }
    };

    return () => (
      <>
        <text testID="persist-depth" class="info-text">
          {`current stack depth: ${state.value.routes.length}`}
        </text>
        <ActionButton
          testID="persist-push"
          title="Push Details to change the depth"
          onPress={() => navigation.value.push(ROUTE_NAME.Details, { id: '1' })}
          color={COLOR}
        />
        <Recipe recipe={saveRecipe}>
          <ActionButton
            testID="persist-serialize"
            title="Serialize current stack"
            onPress={serialize}
            color={COLOR}
          />
          <text-input
            testID="persist-snapshot"
            multiline
            value={snapshot.value ?? ''}
            onValueChange={event => setSnapshot(event.text)}
            placeholder={EMPTY_TEXT}
            placeholderTextColor="#41506a"
            class="text-input snapshot-input"
          />
        </Recipe>
        <Recipe recipe={restoreRecipe}>
          <ActionButton
            testID="persist-restore"
            title="Restore serialized snapshot"
            onPress={restore}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={invalidRecipe}>
          <ActionButton
            testID="persist-break"
            title="Break the snapshot"
            onPress={() => setSnapshot(breakSnapshot())}
            color={COLOR}
          />
          {error.value !== undefined && (
            <text testID="persist-error" class="info-text">
              {`error: ${error.value}`}
            </text>
          )}
        </Recipe>
        <Recipe recipe={resetRecipe}>
          <LabeledChoice
            testID="persist-preset"
            label="stack to reset to"
            value={preset.value}
            options={PRESET_CHOICES}
            onChange={choice => {
              preset.value = choice;
            }}
            color={COLOR}
          />
          <ActionButton
            testID="persist-reset"
            title="reset(state)"
            onPress={() => navigation.value.reset(presetState(preset.value))}
            color={COLOR}
          />
        </Recipe>
      </>
    );
  },
  { name: 'PersistenceRecipes' },
);

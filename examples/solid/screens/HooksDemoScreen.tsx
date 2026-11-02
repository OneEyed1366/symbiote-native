import { createSignal, Index } from 'solid-js';
import {
  createFocusEffect,
  createIsFocused,
  createNavigationState,
  useStackNavigation,
} from '@symbiote-native/navigation/solid';
import { ActionButton } from '../components/ActionButton';
import { Recipe } from '../components/Recipe';
import { ScreenHero } from '../components/ScreenHero';
import { recipeById } from '../navigation-recipes';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';

const COLOR = LINE_COLOR.introspection;
const effectOnce = recipeById('hooks-effect-once');
const isFocusedRecipe = recipeById('hooks-is-focused');
const stateRecipe = recipeById('hooks-navigation-state');
const paramsRecipe = recipeById('hooks-route-params');

// Kept apart so each recipe holds only the values it reads, the body of a Solid screen runs once
function FocusEffectRecipe() {
  const navigation = useStackNavigation();
  const mountedAt = new Date().toLocaleTimeString();
  const [focusCount, setFocusCount] = createSignal(0);
  const [lastBlurAt, setLastBlurAt] = createSignal<number | undefined>(
    undefined,
  );
  createFocusEffect(() => {
    setFocusCount(count => count + 1);
    return () => setLastBlurAt(Date.now());
  });
  return (
    <Recipe recipe={effectOnce}>
      <text testID="hooks-mounted-at" class="info-text">
        {`mounted once, at ${mountedAt}`}
      </text>
      <text testID="hooks-focus-count" class="info-text">
        {`createFocusEffect ran: ${focusCount()}`}
      </text>
      <text class="info-text">
        {lastBlurAt() === undefined
          ? 'not blurred yet'
          : `last blurred at ${lastBlurAt()}`}
      </text>
      <ActionButton
        testID="hooks-push-details"
        title="Push Details"
        onPress={() => navigation().push(ROUTE_NAME.Details)}
        color={COLOR}
      />
    </Recipe>
  );
}

function IsFocusedRecipe() {
  const isFocused = createIsFocused();
  return (
    <Recipe recipe={isFocusedRecipe}>
      <text testID="hooks-is-focused" class="info-text">
        {`createIsFocused(): ${isFocused()}`}
      </text>
    </Recipe>
  );
}

function NavigationStateRecipe() {
  const navigation = useStackNavigation();
  const routeNames = createNavigationState(state =>
    state.routes.map(route => route.name),
  );
  return (
    <Recipe recipe={stateRecipe}>
      <Index each={routeNames()}>
        {(name, index) => (
          <text class="list-row-text">{`${index}. ${name()}`}</text>
        )}
      </Index>
      <ActionButton
        testID="hooks-push-self"
        title="Push this screen again"
        onPress={() => navigation().push(ROUTE_NAME.HooksDemo)}
        color={COLOR}
      />
    </Recipe>
  );
}

function RouteParamsRecipe() {
  const navigation = useStackNavigation();
  return (
    <Recipe recipe={paramsRecipe}>
      <ActionButton
        testID="hooks-push-details-params"
        title="Push Details with params"
        onPress={() =>
          navigation().push(ROUTE_NAME.Details, { openedFrom: 'hooks' })
        }
        color={COLOR}
      />
    </Recipe>
  );
}

// One recipe per question: a one-time mount value against `createFocusEffect`, `createIsFocused`,
// the route stack from `createNavigationState` and params sent with `push`
export function HooksDemoScreen() {
  return (
    <safe-area-view class="screen">
      <scroll-view testID="hooks-scroll" class="screen">
        <view class="scroll-content">
          <ScreenHero
            route={ROUTE_NAME.HooksDemo}
            title="Hooks"
            body="Focus and state hooks of the navigator, each one answering a question people search for."
          />
          <FocusEffectRecipe />
          <IsFocusedRecipe />
          <NavigationStateRecipe />
          <RouteParamsRecipe />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}

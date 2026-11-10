import { useCallback, useState } from 'react';
import {
  useFocusEffect,
  useIsFocused,
  useNavigationState,
  useStackNavigation,
} from '@symbiote-native/navigation/react';
import { ActionButton } from '../components/ActionButton';
import { Recipe } from '../components/Recipe';
import { ScreenHero } from '../components/ScreenHero';
import { recipeById } from '../navigation-recipes';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';

const effectOnce = recipeById('hooks-effect-once');
const isFocusedRecipe = recipeById('hooks-is-focused');
const stateRecipe = recipeById('hooks-navigation-state');
const paramsRecipe = recipeById('hooks-route-params');

// One recipe per question: a one-time mount value against `useFocusEffect`, `useIsFocused`,
// the route stack from `useNavigationState` and params sent with `push`
export function HooksDemoScreen() {
  const navigation = useStackNavigation();
  const [mountedAt] = useState(() => new Date().toLocaleTimeString());
  const [focusCount, setFocusCount] = useState(0);
  const [lastBlurAt, setLastBlurAt] = useState<number | undefined>(undefined);
  const isFocused = useIsFocused();
  const routeNames = useNavigationState(state =>
    state.routes.map(route => route.name),
  );

  useFocusEffect(
    useCallback(() => {
      setFocusCount(count => count + 1);
      return () => setLastBlurAt(Date.now());
    }, []),
  );

  return (
    <safe-area-view className="screen">
      <scroll-view testID="hooks-scroll" className="screen">
        <view className="scroll-content">
          <ScreenHero
            route={ROUTE_NAME.HooksDemo}
            title="Hooks"
            body="Focus and state hooks of the navigator, each one answering a question people search for."
          />
          <Recipe recipe={effectOnce}>
            <text testID="hooks-mounted-at" className="info-text">
              {`mounted once, at ${mountedAt}`}
            </text>
            <text testID="hooks-focus-count" className="info-text">
              {`useFocusEffect ran: ${focusCount}`}
            </text>
            <text className="info-text">
              {lastBlurAt === undefined
                ? 'not blurred yet'
                : `last blurred at ${lastBlurAt}`}
            </text>
            <ActionButton
              testID="hooks-push-details"
              title="Push Details"
              onPress={() => navigation.push(ROUTE_NAME.Details)}
              color={LINE_COLOR.introspection}
            />
          </Recipe>
          <Recipe recipe={isFocusedRecipe}>
            <text testID="hooks-is-focused" className="info-text">
              {`useIsFocused(): ${isFocused}`}
            </text>
          </Recipe>
          <Recipe recipe={stateRecipe}>
            {routeNames.map((name, index) => (
              <text
                key={`${name}-${index}`}
                className="list-row-text"
              >{`${index}. ${name}`}</text>
            ))}
            <ActionButton
              testID="hooks-push-self"
              title="Push this screen again"
              onPress={() => navigation.push(ROUTE_NAME.HooksDemo)}
              color={LINE_COLOR.introspection}
            />
          </Recipe>
          <Recipe recipe={paramsRecipe}>
            <ActionButton
              testID="hooks-push-details-params"
              title="Push Details with params"
              onPress={() =>
                navigation.push(ROUTE_NAME.Details, { openedFrom: 'hooks' })
              }
              color={LINE_COLOR.introspection}
            />
          </Recipe>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}

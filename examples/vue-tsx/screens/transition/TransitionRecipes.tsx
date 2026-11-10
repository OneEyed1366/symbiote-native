import { defineComponent } from 'vue';
import { Animated } from '@symbiote-native/vue';
import {
  useStackNavigation,
  useTransitionProgress,
} from '@symbiote-native/navigation/vue';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { useRouteSettings } from '../use-route-settings';
import type { ITransitionSnapshot } from './transition-readout';
import { readTransitionSettings } from './transition-settings';
import { useTransitionReadout } from './use-transition-readout';

const COLOR = LINE_COLOR.introspection;
const FADE_FROM = 0.2;
const SCALE_FROM = 0.85;
const progressRecipe = recipeById('transition-progress-hook');
const flagsRecipe = recipeById('transition-flags');
const readoutRecipe = recipeById('transition-readout');
const heightRecipe = recipeById('transition-header-height');

type IFlagValue = ReturnType<typeof useTransitionProgress>['closing'];

type ILampProps = { testID: string; label: string; value: IFlagValue };

function Lamp(props: ILampProps) {
  return (
    <view testID={props.testID} class="lamp">
      <Animated.View class="lamp-lit" style={{ opacity: props.value }} />
      <text class="lamp-text">{props.label}</text>
    </view>
  );
}

// Everything here is a native driven value, so a swipe back redraws it without any JS work
export const ProgressRecipes = defineComponent(
  () => {
    const { progress, closing, goingForward } = useTransitionProgress();
    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [FADE_FROM, 1],
      extrapolate: 'clamp',
    });
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [SCALE_FROM, 1],
      extrapolate: 'clamp',
    });
    return () => (
      <>
        <Recipe recipe={progressRecipe}>
          <Animated.View
            testID="transition-card"
            class="transition-card"
            style={{ opacity, transform: [{ scale }] }}
          >
            <text class="transition-card-text">I follow the progress value</text>
          </Animated.View>
        </Recipe>
        <Recipe recipe={flagsRecipe}>
          <view class="lamp-row">
            <Lamp testID="transition-closing" label="closing" value={closing} />
            <Lamp
              testID="transition-going-forward"
              label="goingForward"
              value={goingForward}
            />
          </view>
        </Recipe>
      </>
    );
  },
  { name: 'ProgressRecipes' },
);

function readoutText({ transitions, direction, ticks }: ITransitionSnapshot) {
  if (transitions === 0) return 'No transition has finished yet';
  return `${transitions} finished, the last one ${direction} in ${ticks} ticks`;
}

export const ReadoutRecipe = defineComponent(
  () => {
    const navigation = useStackNavigation();
    const readout = useTransitionReadout();
    return () => (
      <Recipe recipe={readoutRecipe}>
        <text testID="transition-readout" class="list-row-text">
          {readoutText(readout.value)}
        </text>
        <ActionButton
          testID="transition-push"
          title="Push Details"
          onPress={() => navigation.value.push(ROUTE_NAME.Details)}
          color={COLOR}
        />
      </Recipe>
    );
  },
  { name: 'ReadoutRecipe' },
);

export const HeaderHeightRecipe = defineComponent(
  () => {
    const { settings, update } = useRouteSettings(readTransitionSettings);
    const readout = useTransitionReadout();
    return () => {
      const { headerHeight } = readout.value;
      return (
        <Recipe recipe={heightRecipe}>
          <SwitchRow
            testID="transition-translucent"
            label="Translucent header"
            value={settings.value.isTranslucent}
            onChange={isTranslucent => update({ isTranslucent })}
            color={COLOR}
          />
          <SwitchRow
            testID="transition-large-title"
            label="Large title"
            value={settings.value.isLargeTitle}
            onChange={isLargeTitle => update({ isLargeTitle })}
            color={COLOR}
          />
          <view
            testID="transition-ruler"
            class="ruler"
            style={{ height: headerHeight ?? undefined }}
          >
            <text class="list-row-text">
              {headerHeight === null
                ? 'Header height not reported yet'
                : `Header height ${headerHeight}`}
            </text>
          </view>
        </Recipe>
      );
    };
  },
  { name: 'HeaderHeightRecipe' },
);

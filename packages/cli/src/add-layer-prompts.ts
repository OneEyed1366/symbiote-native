import * as clack from '@clack/prompts';
import { CORE_LAYERS, type ICoreLayerFlag } from './core-layers.js';
import { CliUsageError } from './errors.js';
import {
  EXPO_PACKAGE_LAYERS,
  isExpoPackageLayerName,
  type IExpoPackageLayerName,
} from './expo-package-layers.js';
import { assertNotCancelled, isInteractive } from './prompt-helpers.js';
import type { IAddLayerName } from './types.js';

// A safe-by-default confirm, unlike `resolveOverwrite`'s fail-fast shape
// Skipping a layer file that is already there is harmless, so non-interactive "add" does nothing
export async function resolveAddOverwrite(
  hasForce: boolean,
  message: string,
): Promise<boolean> {
  if (hasForce) return true;
  if (!isInteractive()) return false;

  const answer = await clack.confirm({ message, initialValue: false });
  assertNotCancelled(answer);
  return answer;
}

// `expoPackages` is optional, so a caller that only knows the hand-named layers keeps compiling
export type IAddLayerFlags = Record<ICoreLayerFlag, boolean> & {
  expoPackages?: ReadonlySet<IExpoPackageLayerName>;
};

// `satisfies`, not an annotation, so the array stays checked against `IAddLayerName`
// without widening every element's `value` to it
const ADD_LAYER_OPTIONS = [
  ...CORE_LAYERS.map(({ value, label, hint }) => ({ value, label, hint })),
  ...EXPO_PACKAGE_LAYERS.map(layer => ({
    value: layer.id,
    label: layer.label,
    hint: layer.symbiotePackage,
  })),
] as const satisfies ReadonlyArray<{
  readonly value: IAddLayerName;
  readonly label: string;
  readonly hint: string;
}>;

const ADD_LAYER_NAME_SET: ReadonlySet<string> = new Set(
  ADD_LAYER_OPTIONS.map(option => option.value),
);

// Narrows clack's `string[]` answer back to `IAddLayerName[]`, see `groupMultiselect<string>` below
function isAddLayerName(value: string): value is IAddLayerName {
  return ADD_LAYER_NAME_SET.has(value);
}

export function explicitLayersFromFlags(
  flags: IAddLayerFlags,
): IAddLayerName[] {
  return [
    ...CORE_LAYERS.filter(layer => flags[layer.flag]).map(layer => layer.value),
    ...(flags.expoPackages ?? []),
  ];
}

// Every layer stays listed: an already-added one is disabled (clack greys it out), not filtered out
// Grouped so the options have landmarks to scroll by, as the Expo packages outnumber the rest

// There is no return-type annotation, as clack's `Option<Value>` distributes over `Value`
// An annotated, hence widened, type stops matching it once `IAddLayerName` has this many members
export function buildAddLayerOptions(alreadyAdded: ReadonlySet<IAddLayerName>) {
  const withDisabledState = ADD_LAYER_OPTIONS.map(option => {
    const isAlreadyAdded = alreadyAdded.has(option.value);
    return {
      ...option,
      hint: isAlreadyAdded ? 'already added' : option.hint,
      disabled: isAlreadyAdded,
    };
  });
  return {
    'Core layers': withDisabledState.filter(
      option => !isExpoPackageLayerName(option.value),
    ),
    'Expo packages': withDisabledState.filter(option =>
      isExpoPackageLayerName(option.value),
    ),
  };
}

// A selected Expo-package layer implies the `expo-modules` autolinking layer it needs
// Appending it is always safe, as applying it twice is an idempotent text splice
function withImpliedExpoModules(
  layers: readonly IAddLayerName[],
): IAddLayerName[] {
  const needsExpoModules = layers.some(layer => isExpoPackageLayerName(layer));
  return needsExpoModules && !layers.includes('expo-modules')
    ? [...layers, 'expo-modules']
    : [...layers];
}

// Without `hasForce` an already-added layer is dropped, since re-applying it would wipe out
// what the developer built after `new`, and clack's `groupMultiselect` only styles `disabled`
export function dropAlreadyAdded(
  layers: readonly IAddLayerName[],
  alreadyAdded: ReadonlySet<IAddLayerName>,
  hasForce: boolean,
): IAddLayerName[] {
  return hasForce
    ? [...layers]
    : layers.filter(layer => !alreadyAdded.has(layer));
}

// Explicit flags win outright, and the prompt only fills the gaps
// With no flags it offers every layer, an added one `disabled` with an "already added" hint
// It skips the prompt only when every layer is already present
export async function resolveAddLayers(
  flags: IAddLayerFlags,
  alreadyAdded: ReadonlySet<IAddLayerName>,
  hasForce = false,
): Promise<readonly IAddLayerName[]> {
  const explicit = explicitLayersFromFlags(flags);
  if (explicit.length > 0) {
    return withImpliedExpoModules(
      dropAlreadyAdded(explicit, alreadyAdded, hasForce),
    );
  }

  if (ADD_LAYER_OPTIONS.every(option => alreadyAdded.has(option.value)))
    return [];

  if (!isInteractive()) {
    throw new CliUsageError(
      'No layer flags given and not running in an interactive terminal — pass at least one of ' +
        '--navigation/--expo-modules/--testing/--splash-screen/--slider/--reanimated, or an ' +
        'Expo-package flag such as --battery/--sensors.',
    );
  }

  // The explicit `<string>` is needed, as in `resolveFeatures`, so `isAddLayerName` narrows it back
  const answer = await clack.groupMultiselect<string>({
    message: 'Which features to add?',
    options: buildAddLayerOptions(alreadyAdded),
    required: false,
  });
  assertNotCancelled(answer);
  return withImpliedExpoModules(
    dropAlreadyAdded(answer.filter(isAddLayerName), alreadyAdded, hasForce),
  );
}

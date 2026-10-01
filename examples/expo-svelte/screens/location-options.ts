import {
  Accuracy,
  MotionActivityConfidence,
} from '@symbiote-native/location/svelte';
import type {
  ILocationObject,
  ILocationOptions,
} from '@symbiote-native/location/svelte';

export type IOptionsForm = {
  accuracy: Accuracy;
  mayShowUserSettingsDialog: boolean;
  timeInterval: string;
  distanceInterval: string;
  maxAge: string;
  requiredAccuracy: string;
};
export type ISetOptions = (patch: Partial<IOptionsForm>) => void;

export const INITIAL_OPTIONS: IOptionsForm = {
  accuracy: Accuracy.Balanced,
  mayShowUserSettingsDialog: true,
  timeInterval: '',
  distanceInterval: '1',
  maxAge: '',
  requiredAccuracy: '',
};

export const ACCURACIES = [
  { label: 'Lowest', value: Accuracy.Lowest },
  { label: 'Low', value: Accuracy.Low },
  { label: 'Balanced', value: Accuracy.Balanced },
  { label: 'High', value: Accuracy.High },
  { label: 'Highest', value: Accuracy.Highest },
  { label: 'BestForNavigation', value: Accuracy.BestForNavigation },
] as const;

export function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

export function toLocationOptions(form: IOptionsForm): ILocationOptions {
  return {
    accuracy: form.accuracy,
    mayShowUserSettingsDialog: form.mayShowUserSettingsDialog,
    timeInterval: optionalNumber(form.timeInterval),
    distanceInterval: optionalNumber(form.distanceInterval),
  };
}

export function describePosition(location: ILocationObject): string {
  const { coords } = location;
  return `lat ${coords.latitude.toFixed(5)}, lon ${coords.longitude.toFixed(5)}, accuracy ${coords.accuracy}, speed ${coords.speed}, heading ${coords.heading}, at ${new Date(location.timestamp).toISOString()}`;
}

export function describeActivity(activity: {
  activities: Record<
    string,
    { detected: boolean; confidence: MotionActivityConfidence }
  >;
}): string {
  const detected = Object.entries(activity.activities).filter(
    ([, state]) => state.detected,
  );
  return detected.length === 0
    ? 'no activity detected'
    : detected
        .map(
          ([type, state]) =>
            `${type}: ${MotionActivityConfidence[state.confidence]}`,
        )
        .join(', ');
}

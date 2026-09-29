// Svelte lifecycle for a value that follows a native event, boxed getter like
// `use-color-scheme.svelte.ts`

export type IEventValueSource<TValue, TEvent extends string = string> = {
  addListener: (
    event: TEvent,
    listener: (value: TValue) => void,
  ) => { remove: () => void };
};

export function createEventValueHook<
  TSource extends IEventValueSource<TValue, TEvent>,
  TValue,
  TEvent extends string = string,
>(event: TEvent, getValue: (source: TSource) => TValue) {
  return function useEventValue(getSource: () => TSource): {
    readonly current: TValue;
  } {
    let value = $state(getValue(getSource()));

    $effect(() => {
      const source = getSource();
      value = getValue(source);
      const subscription = source.addListener(event, next => {
        value = next;
      });
      return () => subscription.remove();
    });

    return {
      get current(): TValue {
        return value;
      },
    };
  };
}

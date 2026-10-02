// Shared shape behind `subscribeRecordingStatus`/`subscribeAudioStreamBuffer`: one optional
// listener over one named event, unsubscribed via the returned cleanup
export function subscribeSingleEvent<TEvent extends string, TPayload>(
  source: {
    addListener: (
      event: TEvent,
      listener: (payload: TPayload) => void,
    ) => { remove: () => void };
  },
  event: TEvent,
  listener: ((payload: TPayload) => void) | undefined,
): () => void {
  const subscription = source.addListener(event, payload => {
    listener?.(payload);
  });
  return () => subscription.remove();
}

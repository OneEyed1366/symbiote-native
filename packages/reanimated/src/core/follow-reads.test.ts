import { describe, expect, it, vi } from 'vitest';
import { followReads, type ITrack } from './follow-reads';

// A framework's tracking, boiled down to a handle for the change it would report
function manualTrack() {
  let change: () => void = () => undefined;
  const stopped = vi.fn();
  const track: ITrack = (read, onChange) => {
    read();
    change = onChange;
    return stopped;
  };
  return { track, change: () => change(), stopped };
}

describe('following the reads of an updater', () => {
  it('starts the mapper once before anything changes', () => {
    const { track } = manualTrack();
    const restart = vi.fn();

    followReads(track, () => 1, restart);

    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('reads through the tracking, which is how the framework learns what to watch', () => {
    const { track } = manualTrack();
    const read = vi.fn();

    followReads(track, read, vi.fn());

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('starts the mapper again for each change the tracking reports', () => {
    const { track, change } = manualTrack();
    const restart = vi.fn();
    followReads(track, () => 1, restart);

    change();
    change();

    expect(restart).toHaveBeenCalledTimes(3);
  });

  it('hands back the way to stop tracking', () => {
    const { track, stopped } = manualTrack();

    const stop = followReads(track, () => 1, vi.fn());
    stop();

    expect(stopped).toHaveBeenCalledTimes(1);
  });
});

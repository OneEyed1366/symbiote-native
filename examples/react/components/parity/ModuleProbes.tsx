import { MODULE_PROBES } from './module-probes';
import { ParityProbe } from './ParityCard';

// Runtime modules answer for themselves: nothing here needs an eye on the glass
export function ModuleProbes() {
  return (
    <>
      {MODULE_PROBES.map(probe => (
        <ParityProbe
          key={probe.id}
          title={probe.title}
          rn={probe.rn}
          run={probe.run}
        />
      ))}
    </>
  );
}

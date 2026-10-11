/**
 * One writer a frame for a module-level uniform several rigs tick (the street's, a window's view of it, the roof's,
 * the courtyard's): the first to call drives it; another takes over only once the driver has missed a few of their
 * calls (gone dormant or unloaded). So a shared clock never runs twice as fast with two rigs ticking.
 */
export function oneDriver(): { drives(owner: object): boolean } {
  let driver: object | null = null;
  let missed = 0;
  return {
    drives(owner: object): boolean {
      if (owner === driver) {
        missed = 0;
        return true;
      }
      if (driver && ++missed < 3) return false;
      driver = owner;
      missed = 0;
      return true;
    },
  };
}

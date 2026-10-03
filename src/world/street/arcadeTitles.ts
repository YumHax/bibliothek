/** The arcade's cabinets by their game id (as in `ARCADE_GAMES`), as their marquees name them: what the street calls them. */
export const ARCADE_TITLES: Readonly<Record<string, string>> = {
  breakout: 'BRICK STORM', invaders: 'STAR RAID', stacker: 'SKY STACK', frog: 'LEAP FROG', snake: 'NEON SNAKE',
  comets: 'COMET DASH', duel: 'PADDLE WARS', stepbeat: 'STEP BEAT', sheriff: 'NEON SHERIFF', lexipunk: 'LEXIPUNK',
};

/** A cabinet's marquee name (its id in capitals if unknown). */
export function arcadeTitle(id: string): string {
  return ARCADE_TITLES[id] ?? id.toUpperCase();
}

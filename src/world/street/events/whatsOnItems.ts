import { isBrocante, nextBrocante, whenText } from '@/economy/marketEvents';
import type { ArcadeDaily } from '@/economy/ArcadeDaily';
import type { ArcadeTournament } from '@/economy/ArcadeTournament';
import { arcadeTitle } from '../arcadeTitles';

/** What the street's bills say is on: a headline and its line, most pressing first. */
export interface WhatsOnItem {
  title: string;
  line: string;
  /** Today (the bill is pasted over with TODAY). */
  today: boolean;
}

export interface WhatsOnSources {
  /** The market day (`Today.gameDay`). */
  day: () => number;
  /** The arcade's day (its challenge) and its Saturday tournament, when the session has them. */
  daily?: ArcadeDaily;
  tournament?: ArcadeTournament;
}


/**
 * What is on, from the calendars the game already keeps: the next Grand Flea Fair (`marketEvents`),
 * today's arcade challenge (`ArcadeDaily`), the Saturday tournament (`ArcadeTournament`). Read
 * fresh each time: the bills are repainted when the day turns.
 */
export function whatsOn({ day, daily, tournament }: WhatsOnSources): WhatsOnItem[] {
  const today = day();
  const items: WhatsOnItem[] = [];
  const fair = nextBrocante(today);
  const fairToday = isBrocante(today);
  items.push({
    title: 'GRAND FLEA FAIR',
    line: fairToday ? 'Today! The hall full to the rafters, through RETRO GAMES.' : `${capital(whenText(fair - today))}, at the Old Market Hall, through RETRO GAMES.`,
    today: fairToday,
  });
  if (daily) {
    const c = daily.challenge();
    items.push({ title: 'ARCADE CHALLENGE', line: c.done ? `${arcadeTitle(c.gameId)}: beaten today. Back tomorrow for the next.` : `${arcadeTitle(c.gameId)}: score ${c.target.toLocaleString('en')} for ${c.reward} bonus tickets.`, today: !c.done });
  }
  if (tournament) {
    items.push({ title: 'SATURDAY TOURNAMENT', line: tournament.isOn ? `Today, on ${arcadeTitle(tournament.gameId)}: sign the sheet at the arcade.` : 'Every Saturday at the arcade: three rounds, one cabinet.', today: tournament.isOn });
  }
  return items.sort((a, b) => Number(b.today) - Number(a.today));
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

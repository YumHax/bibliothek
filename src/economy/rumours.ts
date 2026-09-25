import { getPlatform } from '@/catalog/platforms';
import { BROCANTE, SALES } from './pricing';
import { whenText, type MarketNews } from './marketEvents';

/*
 * What people say about the market's coming events (`marketNews`), in each voice: a stallholder, the
 * newsstand's paper, a flyer through the door, a card on the market's notice board. Vague on the
 * way (a rumour), plain on the day. Pure: the same news and the same seed read the same.
 */

/** "the day after tomorrow", "in a few days"... as people say it. */
function soon(inDays: number): string {
  return inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : inDays === 2 ? 'the day after tomorrow' : 'in a few days';
}

const percent = (factor: number) => `${Math.round((1 - factor) * 100)}%`;

/** A stallholder's line about it, in a bubble or on a click. */
export function stallRumour(news: MarketNews, pick: number): string {
  switch (news.kind) {
    case 'grail': {
      const g = news.grail!;
      const platform = getPlatform(g.platform).shortName;
      if (news.inDays === 0) return `Have you seen it? ${g.title}, on the ${platform} stall. I've not seen one in twenty years.`;
      const lines = [
        `Word is ${g.seller}. There's a ${g.title} in it, they say. Come ${soon(news.inDays)}.`,
        `Keep this to yourself: a ${platform} collector's dream is coming in ${soon(news.inDays)}. ${g.title}. Boxed.`,
        `Heard about ${g.seller}? If it's true, there's a ${g.title} in there. ${soon(news.inDays)[0]!.toUpperCase()}${soon(news.inDays).slice(1)}, maybe.`,
      ];
      return lines[pick % lines.length]!;
    }
    case 'brocante':
      return news.inDays === 0 ? 'Grande Brocante today! Every table in the hall, and then some.' : `The Grande Brocante is ${soon(news.inDays)}. Once a month, the whole hall. Don't miss it.`;
    case 'catalogueSale':
      return `The mail-order counter's got ${percent(SALES.catalogue.factor)} off new copies ${whenText(news.inDays)}. Don't tell them I said so.`;
    case 'clearance':
      return news.inDays === 0
        ? `The ${getPlatform(news.platform!).shortName} stall is clearing out: ${percent(SALES.clearance.factor)} off, no haggling.`
        : `The ${getPlatform(news.platform!).shortName} lot are clearing out tomorrow. Everything must go.`;
  }
}

/** A tip in THE GAMING WEEKLY. */
export function paperRumour(news: MarketNews): string {
  switch (news.kind) {
    case 'grail': {
      const g = news.grail!;
      if (news.inDays === 0) return `GRAIL ALERT: a boxed ${g.title} (${getPlatform(g.platform).shortName}) is on the market today. ${g.lore}`;
      return `Rumour: ${g.seller}, and a ${g.title} may be among it. Expected at the market ${soon(news.inDays)}.`;
    }
    case 'brocante':
      return news.inDays === 0 ? 'The Grande Brocante is on: heaped stalls, a deep bargain bin, the whole neighbourhood in the hall.' : `Diary: the monthly Grande Brocante is ${soon(news.inDays)}. More stalls, more crates, ${percent(BROCANTE.priceFactor)} off everywhere.`;
    case 'catalogueSale':
      return `Mail-order sale ${whenText(news.inDays)}: ${percent(SALES.catalogue.factor)} off every new copy at the market's counter.`;
    case 'clearance':
      return `Clearance ${whenText(news.inDays)}: the ${getPlatform(news.platform!).shortName} stall sells at ${percent(SALES.clearance.factor)} off. No haggling.`;
  }
}

/** A flyer on the doormat: its title and three lines. */
export function flyerRumour(news: MarketNews): { title: string; lines: string[]; accent: number } {
  switch (news.kind) {
    case 'grail': {
      const g = news.grail!;
      const platform = getPlatform(g.platform).shortName;
      return news.inDays === 0
        ? { title: 'COLLECTORS!', lines: [`${g.title} (${platform})`, 'On the flea market today', 'Boxed. First come, first served.'], accent: 0x8a6d1f }
        : { title: 'HOUSE CLEARANCE', lines: [`${platform} games, boxed`, 'Rarities among them, we hear', `At the flea market ${soon(news.inDays)}`], accent: 0x8a6d1f };
    }
    case 'brocante':
      return { title: 'GRANDE BROCANTE', lines: [news.inDays === 0 ? 'Today, all day' : `${soon(news.inDays)[0]!.toUpperCase()}${soon(news.inDays).slice(1)}, all day`, 'Every stall heaped, a huge bargain bin', 'The flea market, once a month'], accent: 0xb3402a };
    case 'catalogueSale':
      return { title: 'MAIL-ORDER SALE', lines: [`${percent(SALES.catalogue.factor)} off new games`, whenText(news.inDays) === 'today' ? 'Today only' : 'Tomorrow only', 'The counter at the flea market'], accent: 0x2f6b8f };
    case 'clearance':
      return { title: 'CLEARANCE', lines: [`${getPlatform(news.platform!).shortName} stall: ${percent(SALES.clearance.factor)} off`, whenText(news.inDays) === 'today' ? 'Today only' : 'Tomorrow only', 'Everything must go'], accent: 0xc8443a };
  }
}

/** A line on the market's notice board (the "coming up" corner). */
export function noticeRumour(news: MarketNews): string {
  switch (news.kind) {
    case 'grail':
      return news.inDays === 0 ? `TODAY: ${news.grail!.title} on the ${getPlatform(news.grail!.platform).shortName} stall` : `Heard: ${news.grail!.seller}, ${soon(news.inDays)}. Rarities.`;
    case 'brocante':
      return news.inDays === 0 ? 'GRANDE BROCANTE: today!' : `GRANDE BROCANTE ${soon(news.inDays)}`;
    case 'catalogueSale':
      return `Mail order: ${percent(SALES.catalogue.factor)} off new copies ${whenText(news.inDays)}`;
    case 'clearance':
      return `${getPlatform(news.platform!).shortName} stall clearance ${whenText(news.inDays)}: ${percent(SALES.clearance.factor)} off`;
  }
}

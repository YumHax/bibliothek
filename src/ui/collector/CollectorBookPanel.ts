import type { Game } from '@/catalog/types';
import type { GameSource } from '@/collection/GameSource';
import { getPlatform } from '@/catalog/platforms';
import { COLLECTOR_SETS, setProgress } from '@/economy/collectorSets';
import { MILESTONES, milestoneReward, type Milestone } from '@/economy/milestoneList';
import type { Milestones } from '@/economy/Milestones';
import type { ValueHistory } from '@/economy/ValueHistory';
import type { CollectorWatch } from '@/economy/CollectorWatch';
import { playCoins } from '@/audio/coins';
import { MarketPanel, coinsHtml, escapeHtml } from '../market/MarketPanel';
import { drawValueChart } from './valueChart';
import './collector.css';

type Tab = 'milestones' | 'sets' | 'value';
const TABS: { id: Tab; label: string }[] = [
  { id: 'milestones', label: 'Milestones' },
  { id: 'sets', label: 'Sets' },
  { id: 'value', label: 'Value' },
];

/** How many of the most valuable copies the value page lists. */
const TOP_COUNT = 10;

export interface CollectorBookDeps {
  /** The purse the milestones' rewards are paid into. */
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void; earnCoins(coins: number): void; addTickets(tickets: number): void };
  collection: GameSource;
  /** Which of the collectors' club's sets had their reward claimed (at the market's notice board). */
  standing?: { hasClaimed(setId: string): boolean; subscribe(cb: () => void): () => void };
  milestones: Milestones;
  history: ValueHistory;
  watch: CollectorWatch;
  coverUrl?: (game: Game) => string | undefined;
}

/**
 * The collector's book, the binder on the living room's sideboard, as a panel with three tabs.
 * Milestones: the collection's size, depth, breadth, the arcade and the market, each with its date
 * once reached and a reward to claim (the plaque and the display cabinet appear in the flat on
 * their own). Sets: the collectors' club's sets, piece by piece (their reward is claimed at the
 * market's notice board). Value: what the collection is worth, day by day, and its best copies.
 */
export class CollectorBookPanel extends MarketPanel {
  private tab: Tab = 'milestones';

  constructor(container: HTMLElement, private readonly deps: CollectorBookDeps) {
    super(container, deps.wallet, { title: 'Collector’s book', className: 'collector-book', blurb: 'Everything the collection has become, in one binder.' });
    const repaint = () => {
      if (this.isOpen) this.refresh();
    };
    deps.collection.subscribe(repaint);
    deps.milestones.subscribe(repaint);
    deps.history.subscribe(repaint);
    deps.standing?.subscribe(repaint);
  }

  protected onOpened(): void {
    this.deps.watch.refresh();
    super.onOpened();
  }

  protected render(): void {
    const tabs = TABS.map((t) => {
      const selected = t.id === this.tab;
      const badge = t.id === 'milestones' && this.deps.milestones.unclaimed ? ` <span class="collector__badge">${this.deps.milestones.unclaimed}</span>` : '';
      return `<button type="button" class="ui-btn" role="tab" id="collector-tab-${t.id}" aria-controls="collector-tabpanel" data-action="tab" data-tab="${t.id}" aria-selected="${selected}" ${selected ? 'data-autofocus' : 'tabindex="-1"'}>${t.label}${badge}</button>`;
    }).join('');
    const content = this.tab === 'milestones' ? this.milestonesHtml() : this.tab === 'sets' ? this.setsHtml() : this.valueHtml();
    this.body.innerHTML = `
      <div class="notices__tabs" role="tablist" aria-label="Collector’s book">${tabs}</div>
      <div class="collector__panel" role="tabpanel" id="collector-tabpanel" aria-labelledby="collector-tab-${this.tab}">${content}</div>`;
    const chart = this.body.querySelector<HTMLCanvasElement>('.collector__chart');
    if (chart) drawValueChart(chart, this.deps.history.all);
  }

  /** D-pad left / right (or the arrow keys) flip through the tabs. */
  protected onSide(direction: 1 | -1): boolean {
    const at = TABS.findIndex((t) => t.id === this.tab);
    this.tab = TABS[(at + direction + TABS.length) % TABS.length]!.id;
    this.refresh();
    this.body.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return true;
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action === 'tab' && el.dataset.tab) {
      this.tab = el.dataset.tab as Tab;
      this.refresh();
    } else if (action === 'claim' && el.dataset.id) this.claim(el.dataset.id);
  }

  private milestonesHtml(): string {
    const { milestones, watch } = this.deps;
    const facts = watch.facts();
    const reached = MILESTONES.filter((m) => milestones.has(m.id)).length;
    const rows = MILESTONES.map((m) => this.milestoneRow(m, m.progress(facts))).join('');
    return `<p class="catalogue__meta">${reached} of ${MILESTONES.length} reached.</p>${rows}`;
  }

  private milestoneRow(m: Milestone, progress: { have: number; need: number; note?: string }): string {
    const { milestones } = this.deps;
    const done = milestones.has(m.id);
    const on = milestones.reachedOn(m.id);
    const { coins, tickets } = milestoneReward(m.id);
    const reward = coins ? coinsHtml(coins) : tickets ? `<span class="catalogue__price">${tickets} tickets</span>` : '';
    const home = m.home === 'plaque' ? 'brass plaque' : m.home === 'vitrine' ? 'display cabinet' : '';
    const share = Math.min(1, progress.have / progress.need);
    const count = progress.need >= 1000 ? `${Math.min(progress.have, progress.need).toLocaleString('en-US')} / ${progress.need.toLocaleString('en-US')}` : `${Math.min(progress.have, progress.need)} / ${progress.need}`;
    let button = '';
    if (coins || tickets) {
      button = milestones.isClaimed(m.id) ? '<button type="button" class="ui-btn" disabled>Claimed</button>'
        : `<button type="button" class="ui-btn${done ? ' ui-btn--primary' : ''}" data-action="claim" data-id="${m.id}" ${done ? '' : 'disabled'}>${done ? 'Claim' : 'Locked'}</button>`;
    }
    return `
      <div class="catalogue__row collector__milestone${done ? ' collector__milestone--done' : ''}">
        <span class="collector__seal" aria-hidden="true">${done ? '★' : '☆'}</span>
        <span class="catalogue__title"><b>${escapeHtml(m.title)}</b> <span class="catalogue__meta">${escapeHtml(m.blurb)}${home ? ` · brings home the ${home}` : ''}</span>
          <span class="collector__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.need}" aria-valuenow="${Math.min(progress.have, progress.need)}"><span style="width:${(share * 100).toFixed(1)}%"></span></span>
          <span class="catalogue__meta">${done && on ? `reached ${escapeHtml(formatDay(on))}` : count}${progress.note && !done ? ` · ${escapeHtml(progress.note)}` : ''}</span>
        </span>
        ${reward}${button}
      </div>`;
  }

  private setsHtml(): string {
    const { collection, standing } = this.deps;
    const intro = '<p class="catalogue__meta">The collectors’ club’s list. A complete set’s reward is paid at the notice board by the market’s way in.</p>';
    return intro + COLLECTOR_SETS.map((set) => {
      const progress = setProgress(set, collection.games);
      const have = progress.filter((p) => p.have).length;
      const complete = have === progress.length;
      const claimed = standing?.hasClaimed(set.id) ?? false;
      const state = claimed ? 'reward claimed' : complete ? 'complete: claim it at the notice board' : `${have} / ${progress.length}`;
      const pieces = progress.map(({ piece, have }) => `<li class="${have ? 'notices__have' : ''}">${have ? '✔' : '○'} ${escapeHtml(piece.name)} <span class="catalogue__meta">${escapeHtml(getPlatform(piece.platform).shortName)}</span></li>`).join('');
      return `
        <div class="notices__set${complete ? ' notices__set--done' : ''}">
          <div class="catalogue__row"><span class="catalogue__title"><b>${escapeHtml(set.name)}</b> <span class="catalogue__meta">${escapeHtml(state)}</span></span><span class="catalogue__meta">reward</span>${coinsHtml(set.reward)}</div>
          <ul class="notices__pieces">${pieces}</ul>
        </div>`;
    }).join('');
  }

  private valueHtml(): string {
    const { watch, history, collection, coverUrl } = this.deps;
    const value = watch.value();
    const points = history.all;
    const first = points[0];
    const since = first && points.length > 1 ? ` · ${signed(value.market - first.value)} since ${escapeHtml(formatDay(first.day))}` : '';
    const pending = value.pending ? `<p class="catalogue__meta">${value.pending} game${value.pending === 1 ? ' is' : 's are'} still being priced: the estimate firms up as they are.</p>` : '';
    const top = watch.showpieces(TOP_COUNT, collection.games).map(({ game, value }, i) => {
      const cover = coverUrl?.(game);
      return `
        <div class="catalogue__row">
          <span class="collector__rank">${i + 1}</span>
          ${cover ? `<img class="catalogue__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : ''}
          <span class="catalogue__title">${escapeHtml(game.title)} <span class="catalogue__meta">${escapeHtml(getPlatform(game.platform).shortName)}${game.status === 'lent' ? ' · lent out' : ''}</span></span>
          ${coinsHtml(value)}
        </div>`;
    }).join('');
    return `
      <h3>Worth about ${value.market.toLocaleString('en-US')} coins <span class="catalogue__meta">the market’s asking prices on an average day${since}</span></h3>
      <p class="catalogue__meta">The WE BUY desk would give ${value.desk.toLocaleString('en-US')} coins for the lot.</p>
      ${pending}
      <canvas class="collector__chart" width="640" height="180" aria-label="The collection's value, day by day"></canvas>
      <h3>The best of it</h3>
      ${top || '<p class="catalogue__empty">Nothing yet: the collection is empty.</p>'}`;
  }

  private claim(id: string): void {
    const { milestones, wallet } = this.deps;
    const { coins, tickets } = milestoneReward(id);
    if (!milestones.claim(id, wallet)) return;
    playCoins(coins ? 3 : 1);
    this.setStatus(coins ? `+${coins} coins in your pocket.` : `+${tickets} tickets in your pocket.`);
    this.refresh();
  }
}

/** "25 Sep 2026" from a `dayKey`. */
function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US')}`;
}

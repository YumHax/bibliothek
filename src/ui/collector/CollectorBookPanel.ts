import type { Game } from '@/catalog/types';
import type { GameSource } from '@/collection/GameSource';
import { getPlatform } from '@/catalog/platforms';
import { COLLECTOR_SETS, setProgress } from '@/economy/collectorSets';
import { MILESTONES, milestoneReward, type Milestone } from '@/economy/milestoneList';
import type { Milestones } from '@/economy/Milestones';
import type { ValueHistory } from '@/economy/ValueHistory';
import type { CollectorWatch } from '@/economy/CollectorWatch';
import { playCoins } from '@/audio/coins';
import { MarketPanel } from '../market/MarketPanel';
import { attr, html, paint, type Html } from '../panel/html';
import { coverImg, emptyState, nextTab, priceHtml, tabs } from '../panel/widgets';
import { drawValueChart } from './valueChart';
import { formatDay } from '@/text/clock';
import { formatNumber } from '@/text/count';
import { formatCoins, formatTickets } from '@/text/money';
import './collector.css';

type Tab = 'milestones' | 'sets' | 'value';
const TAB_IDS: readonly Tab[] = ['milestones', 'sets', 'value'];

/** How many of the most valuable copies the value page lists. */
const TOP_COUNT = 10;

interface CollectorBookDeps {
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

  protected override onOpened(): void {
    this.deps.watch.refresh();
    super.onOpened();
  }

  protected render(): void {
    const unclaimed = this.deps.milestones.unclaimed;
    const content = this.tab === 'milestones' ? this.milestonesHtml() : this.tab === 'sets' ? this.setsHtml() : this.valueHtml();
    paint(
      this.body,
      html`${tabs({
        tabs: [
          { id: 'milestones', label: unclaimed ? html`Milestones <span class="collector__badge">${unclaimed}</span>` : 'Milestones' },
          { id: 'sets', label: 'Sets' },
          { id: 'value', label: 'Value' },
        ],
        active: this.tab,
        className: 'notices__tabs',
        label: 'Collector’s book',
        idPrefix: 'collector-tab',
        controls: 'collector-tabpanel',
      })}
      <div class="collector__panel" role="tabpanel" id="collector-tabpanel" aria-labelledby="collector-tab-${this.tab}">${content}</div>`,
    );
    const chart = this.body.querySelector<HTMLCanvasElement>('.collector__chart');
    if (chart) drawValueChart(chart, this.deps.history.all);
  }

  /** D-pad left / right (or the arrow keys) flip through the tabs. */
  protected override onSide(direction: 1 | -1): boolean {
    this.tab = nextTab(TAB_IDS, this.tab, direction);
    this.refresh();
    this.body.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return true;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'tab' && el.dataset.tab) {
      this.tab = el.dataset.tab as Tab;
      this.refresh();
    } else if (action === 'claim' && el.dataset.id) this.claim(el.dataset.id);
  }

  private milestonesHtml(): Html {
    const { milestones, watch } = this.deps;
    const facts = watch.facts();
    const reached = MILESTONES.filter((m) => milestones.has(m.id)).length;
    return html`<p class="catalogue__meta">${reached} of ${MILESTONES.length} reached.</p>${MILESTONES.map((m) => this.milestoneRow(m, m.progress(facts)))}`;
  }

  private milestoneRow(m: Milestone, progress: { have: number; need: number; note?: string }): Html {
    const { milestones } = this.deps;
    const done = milestones.has(m.id);
    const on = milestones.reachedOn(m.id);
    const { coins, tickets } = milestoneReward(m.id);
    const reward = coins ? priceHtml(coins) : tickets ? html`<span class="catalogue__price">${formatTickets(tickets)}</span>` : '';
    const home = m.home === 'plaque' ? 'brass plaque' : m.home === 'vitrine' ? 'display cabinet' : '';
    const share = Math.min(1, progress.have / progress.need);
    const count = `${formatNumber(Math.min(progress.have, progress.need))} / ${formatNumber(progress.need)}`;
    let button: Html | '' = '';
    if (coins || tickets) {
      button = milestones.isClaimed(m.id)
        ? html`<button type="button" class="ui-btn" disabled>Claimed</button>`
        : html`<button type="button" class="ui-btn${done ? ' ui-btn--primary' : ''}" data-action="claim" data-id="${m.id}"${attr('disabled', !done)}>${done ? 'Claim' : 'Locked'}</button>`;
    }
    return html`<div class="catalogue__row collector__milestone${done ? ' collector__milestone--done' : ''}">
        <span class="collector__seal" aria-hidden="true">${done ? '★' : '☆'}</span>
        <span class="catalogue__title"><b>${m.title}</b> <span class="catalogue__meta">${m.blurb}${home ? ` · brings home the ${home}` : ''}</span>
          <span class="collector__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.need}" aria-valuenow="${Math.min(progress.have, progress.need)}"><span style="width:${(share * 100).toFixed(1)}%"></span></span>
          <span class="catalogue__meta">${done && on ? `reached ${formatDay(on)}` : count}${progress.note && !done ? ` · ${progress.note}` : ''}</span>
        </span>
        ${reward}${button}
      </div>`;
  }

  private setsHtml(): Html {
    const { collection, standing } = this.deps;
    return html`<p class="catalogue__meta">The collectors’ club’s list. A complete set’s reward is paid at the notice board by the market’s way in.</p>${COLLECTOR_SETS.map((set) => {
      const progress = setProgress(set, collection.games);
      const have = progress.filter((p) => p.have).length;
      const complete = have === progress.length;
      const claimed = standing?.hasClaimed(set.id) ?? false;
      const state = claimed ? 'reward claimed' : complete ? 'complete: claim it at the notice board' : `${have} / ${progress.length}`;
      const pieces = progress.map(({ piece, have }) => html`<li class="${have ? 'notices__have' : ''}">${have ? '✔' : '○'} ${piece.name} <span class="catalogue__meta">${getPlatform(piece.platform).shortName}</span></li>`);
      return html`<div class="notices__set${complete ? ' notices__set--done' : ''}">
          <div class="catalogue__row"><span class="catalogue__title"><b>${set.name}</b> <span class="catalogue__meta">${state}</span></span><span class="catalogue__meta">reward</span>${priceHtml(set.reward)}</div>
          <ul class="notices__pieces">${pieces}</ul>
        </div>`;
    })}`;
  }

  private valueHtml(): Html {
    const { watch, history, collection, coverUrl } = this.deps;
    const value = watch.value();
    const points = history.all;
    const first = points[0];
    const since = first && points.length > 1 ? ` · ${formatNumber(value.market - first.value, { sign: true })} since ${formatDay(first.day)}` : '';
    const pending = value.pending ? html`<p class="catalogue__meta">${value.pending} game${value.pending === 1 ? ' is' : 's are'} still being priced: the estimate firms up as they are.</p>` : '';
    const top = watch.showpieces(TOP_COUNT, collection.games).map(({ game, value }, i) => html`<div class="catalogue__row">
          <span class="collector__rank">${i + 1}</span>
          ${coverImg(coverUrl?.(game), game)}
          <span class="catalogue__title">${game.title} <span class="catalogue__meta">${getPlatform(game.platform).shortName}${game.status === 'lent' ? ' · lent out' : ''}</span></span>
          ${priceHtml(value)}
        </div>`);
    return html`<h3>Worth about ${formatCoins(value.market)} <span class="catalogue__meta">the market’s asking prices on an average day${since}</span></h3>
      <p class="catalogue__meta">The WE BUY desk would give ${formatCoins(value.desk)} for the lot.</p>
      ${pending}
      <canvas class="collector__chart" width="640" height="180" aria-label="The collection’s value, day by day"></canvas>
      <h3>The best of it</h3>
      ${top.length ? top : emptyState('Nothing yet: the collection is empty.')}`;
  }

  private claim(id: string): void {
    const { milestones, wallet } = this.deps;
    const { coins, tickets } = milestoneReward(id);
    if (!milestones.claim(id, wallet)) return;
    playCoins(coins ? 3 : 1);
    this.setStatus(`${coins ? formatCoins(coins, { sign: true }) : formatTickets(tickets ?? 0, { sign: true })} in your pocket.`);
    this.refresh();
  }
}

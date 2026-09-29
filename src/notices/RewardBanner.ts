import { formatCoins } from '@/ui/money';
import { reduceMotion } from '@/settings/motion';
import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';
import type { RewardNotice } from './types';

const MIN_MS = 3200;
/** The big ones stay a little longer: the rays are part of the fun. */
const BIG_EXTRA_MS = 1200;
const FADE_MS = 360;
/** Past this many waiting, the waiting ones are merged into one "and more" banner rather than dropped. */
const QUEUE_MAX = 4;

/**
 * THE REWARD: something gained, in the middle of the screen, big: the title in the display font,
 * a line under it, the coins and tickets as chips, and a fanfare. One at a time; the rest queue,
 * so two rewards in a row are both seen. A big one (a milestone, a prize, a tournament) has rays.
 */
export class RewardBanner {
  private readonly root: HTMLDivElement;
  private readonly queue: RewardNotice[] = [];
  private current: HTMLDivElement | null = null;
  /** Between a banner gone and the next one up. */
  private opening = false;
  private left = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'reward-stage';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    container.appendChild(this.root);
  }

  show(reward: RewardNotice): void {
    if (this.current || this.opening) {
      this.queue.push(reward);
      if (this.queue.length > QUEUE_MAX) {
        const extra = this.queue.splice(QUEUE_MAX - 1);
        this.queue.push(merged(extra));
      }
      return;
    }
    this.open(reward);
  }

  update(dt: number, attending: boolean): void {
    if (!this.current) return;
    if (attending) this.left -= dt * 1000;
    if (this.left > 0) return;
    const el = this.current;
    this.current = null;
    el.classList.add('reward--out');
    window.setTimeout(() => el.remove(), FADE_MS);
    const next = this.queue.shift();
    if (!next) return;
    this.opening = true;
    window.setTimeout(() => {
      this.opening = false;
      this.open(next);
    }, FADE_MS * 0.6);
  }

  private open(reward: RewardNotice): void {
    const el = document.createElement('div');
    // Reduced motion: no overshoot on the way in, no spinning rays (notices.css).
    el.className = `reward${reward.big ? ' reward--big' : ''}${reduceMotion() ? ' reward--calm' : ''}`;
    if (reward.big) {
      const rays = document.createElement('div');
      rays.className = 'reward__rays';
      el.appendChild(rays);
    }
    const title = document.createElement('div');
    title.className = 'reward__title';
    title.textContent = reward.title;
    el.appendChild(title);
    if (reward.detail) {
      const detail = document.createElement('div');
      detail.className = 'reward__detail';
      detail.textContent = reward.detail;
      el.appendChild(detail);
    }
    const chips = [chip(reward.coins, 'coin'), chip(reward.tickets, 'ticket')].filter((c): c is HTMLSpanElement => c !== null);
    if (chips.length) {
      const row = document.createElement('div');
      row.className = 'reward__chips';
      row.append(...chips);
      el.appendChild(row);
    }
    this.root.appendChild(el);
    this.current = el;
    this.left = Math.max(MIN_MS, readMs(`${reward.title} ${reward.detail ?? ''}`) + 600) + (reward.big ? BIG_EXTRA_MS : 0);
    const gain = (reward.coins ?? 0) > 0 || (reward.tickets ?? 0) > 0 || reward.big;
    playNoticeSound(reward.big ? 'fanfare' : gain ? 'reward' : 'tip');
  }
}

function chip(amount: number | undefined, kind: 'coin' | 'ticket'): HTMLSpanElement | null {
  if (!amount) return null;
  const el = document.createElement('span');
  el.className = `reward__chip reward__chip--${kind}${amount < 0 ? ' reward__chip--spent' : ''}`;
  const icon = document.createElement('span');
  icon.className = `reward__icon reward__icon--${kind}`;
  el.append(icon, formatCoins(amount, { sign: true, unit: kind }));
  return el;
}

/** How many rewards a merged banner stands for (a merged one merged again still counts them all). */
const MERGED = new WeakMap<RewardNotice, number>();

/** Several waiting rewards as one: the first's title, the others counted, their amounts summed. */
function merged(rewards: RewardNotice[]): RewardNotice {
  const sum = (key: 'coins' | 'tickets') => rewards.reduce((total, r) => total + (r[key] ?? 0), 0);
  const count = rewards.reduce((total, r) => total + (MERGED.get(r) ?? 1), 0);
  const first = rewards[0]!;
  const reward: RewardNotice = {
    title: first.title,
    detail: `…and ${count - 1} more`,
    coins: sum('coins') || undefined,
    tickets: sum('tickets') || undefined,
    big: rewards.some((r) => r.big),
  };
  MERGED.set(reward, count);
  return reward;
}

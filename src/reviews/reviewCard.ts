import { escapeHtml } from '@/ui/html';
import type { Reviews } from './Reviews';
import './reviewCard.css';

/** At most this many score badges on the card (the aggregates come first). */
const BADGES = 4;

/**
 * The press at the time as a clipping: score badges (an aggregate's in the accent), the quoted line in
 * italics with the publication, and where it comes from: the Wikipedia article, linked, under its
 * licence (CC BY-SA). Empty string when there is nothing to show (no article, or nothing in it).
 */
export function reviewCardHtml(reviews: Reviews): string {
  const scores = reviews.scores.slice(0, BADGES);
  const line = reviews.quote
    ? `<blockquote class="review-card__quote">“${escapeHtml(reviews.quote.text)}”${reviews.quote.source ? `<cite>${escapeHtml(reviews.quote.source)}</cite>` : ''}</blockquote>`
    : reviews.summary ? `<p class="review-card__summary">${escapeHtml(reviews.summary)}</p>` : '';
  if (!scores.length && !line) return '';
  const badges = scores.length
    ? `<ul class="review-card__scores">${scores
      .map((s) => `<li class="review-card__score${s.aggregate ? ' review-card__score--aggregate' : ''}"><b>${escapeHtml(s.score)}</b><span>${escapeHtml(s.source)}</span></li>`)
      .join('')}</ul>`
    : '';
  const credit = reviews.fiction
    ? `<footer class="review-card__credit">${escapeHtml(reviews.fiction.credit)}</footer>`
    : reviews.article
      ? `<footer class="review-card__credit">From Wikipedia: ${reviews.url?.startsWith('https://en.wikipedia.org/') ? `<a href="${escapeHtml(reviews.url)}" target="_blank" rel="noopener">${escapeHtml(reviews.article)}</a>` : escapeHtml(reviews.article)} · CC BY-SA 4.0</footer>`
      : '';
  return `<h3 class="review-card__head">The press at the time</h3>${badges}${line}${credit}`;
}

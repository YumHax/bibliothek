import { fitFontSize, FONT } from '@/covers/generated/canvasUtils';
import type { PosterPainter } from './Poster';

/**
 * A game shop's display poster from the nineties, for a `Poster`: a made-up sequel ("STAR
 * RUNNER II") over a sunset and a perspective grid, a starburst "NEW!", the release line and a
 * strip of made-up ratings at the foot. Portrait.
 */
export function shopPoster(): PosterPainter {
  return (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#1a0f3a');
    sky.addColorStop(0.55, '#6a2a7a');
    sky.addColorStop(1, '#f08a3a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // A striped sun sinking behind the horizon.
    const sunR = w * 0.3;
    const horizon = h * 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, horizon, sunR, Math.PI, 0);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, horizon - sunR, 0, horizon);
    sun.addColorStop(0, '#ffe066');
    sun.addColorStop(1, '#ff5f7a');
    ctx.fillStyle = sun;
    ctx.fillRect(0, horizon - sunR, w, sunR);
    ctx.fillStyle = '#6a2a7a';
    for (let i = 1; i < 6; i++) ctx.fillRect(0, horizon - sunR * (i / 6) ** 0.8 * 0.6, w, i * 1.6);
    ctx.restore();
    // The grid floor running to the horizon.
    ctx.fillStyle = '#12082a';
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 2;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * w * 0.02, horizon);
      ctx.lineTo(w / 2 + i * w * 0.2, h * 0.9);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const y = horizon + (h * 0.9 - horizon) * (i / 6) ** 1.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Title, chrome-ish: a dark offset, a gradient fill.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const family = `Impact, "Arial Narrow", ${FONT}`;
    fitFontSize(ctx, 'STAR RUNNER', w * 0.86, h * 0.1, 20, family, '900');
    const chrome = ctx.createLinearGradient(0, h * 0.12, 0, h * 0.22);
    chrome.addColorStop(0, '#ffffff');
    chrome.addColorStop(0.5, '#9ad8ff');
    chrome.addColorStop(0.52, '#2a4a8a');
    chrome.addColorStop(1, '#cfe8ff');
    ctx.fillStyle = '#0a0520';
    ctx.fillText('STAR RUNNER', w / 2 + 4, h * 0.17 + 4);
    ctx.fillStyle = chrome;
    ctx.fillText('STAR RUNNER', w / 2, h * 0.17);
    fitFontSize(ctx, 'II', w * 0.3, h * 0.12, 20, family, '900');
    ctx.fillStyle = '#ffe066';
    ctx.fillText('II', w / 2, h * 0.28);
    // The starburst in the corner.
    const bx = w * 0.8;
    const by = h * 0.36;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? w * 0.09 : w * 0.13;
      const a = (i / 24) * Math.PI * 2;
      ctx.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.font = `900 ${Math.round(w * 0.07)}px ${family}`;
    ctx.fillText('NEW!', bx, by);
    // Release line and the foot strip.
    ctx.fillStyle = '#ffffff';
    fitFontSize(ctx, 'IN STORES NOW · 16-BIT', w * 0.8, h * 0.04, 12, FONT, 'bold');
    ctx.fillText('IN STORES NOW · 16-BIT', w / 2, h * 0.86);
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, h * 0.92, w, h * 0.08);
    ctx.fillStyle = '#1e1a18';
    fitFontSize(ctx, '"A BLAST" 94% · 1-2 PLAYERS · 16 MEG', w * 0.9, h * 0.03, 10, FONT, 'bold');
    ctx.fillText('"A BLAST" 94% · 1-2 PLAYERS · 16 MEG', w / 2, h * 0.96);
  };
}

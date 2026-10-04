import { ATTIC_PLAN } from '../attic/atticPlan'; // imports-ok: the hunt's clues point at the attic's lift code and chest
import type { ClueMarkLook } from './ClueMark';
import { writeLines } from './ClueMark';

/*
 * How the hunt's clues look where they lie (`ClueMark`): the chalk on the cellars' far wall, the card
 * in the nameless mailbox, the initials carved in the chestnut. Painted on canvases, once.
 */

const floors = ATTIC_PLAN.liftCode.floors;

/** Six buttons in chalk, like the car's panel, the first three ringed with arrows between, and his line under them. */
export const CHALK: ClueMarkLook = {
  width: 0.62,
  height: 0.5,
  transparent: true,
  caption: 'Chalk marks on the brick',
  paint: (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(236,232,220,0.85)';
    ctx.fillStyle = 'rgba(236,232,220,0.85)';
    ctx.lineWidth = w * 0.008;
    ctx.lineCap = 'round';
    // The panel: a rounded frame, two columns of three buttons (5th at the top, as in the car).
    const names = ['5', '4', '3', '2', '1', 'G'];
    const at = (i: number): [number, number] => [w * (0.3 + 0.2 * (i % 2)), h * (0.14 + 0.15 * Math.floor(i / 2))];
    ctx.strokeRect(w * 0.18, h * 0.04, w * 0.44, h * 0.5);
    ctx.font = `${Math.round(h * 0.06)}px "Comic Sans MS", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    names.forEach((n, i) => {
      const [x, y] = at(i);
      ctx.beginPath();
      ctx.arc(x, y, h * 0.05, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(n, x, y);
    });
    // The first three of the code ringed, arrows from one to the next.
    const order = floors.slice(0, 3).map((f) => names.indexOf(f.replace(/(st|nd|rd|th)$/, '')));
    ctx.lineWidth = w * 0.012;
    order.forEach((i, n) => {
      const [x, y] = at(i);
      ctx.beginPath();
      ctx.arc(x, y, h * 0.075, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(String(n + 1), x + h * 0.1, y - h * 0.06);
    });
    writeLines(ctx, w, h, [`${floors[0]} → ${floors[1]} → ${floors[2]} → …`, 'The rest in the box with no name', 'H.L.'], { font: `${Math.round(h * 0.065)}px "Comic Sans MS", cursive`, colour: 'rgba(236,232,220,0.85)', top: 0.66, step: 0.12 });
  },
};

/** An old visiting card pushed into the nameless mailbox's slot, his pencil on it. */
export const MAILBOX_CARD: ClueMarkLook = {
  width: 0.1,
  height: 0.06,
  caption: 'A card in the mailbox with no name',
  paint: (ctx, w, h) => {
    ctx.fillStyle = '#efe4c8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,96,60,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    writeLines(ctx, w, h, ['H. LAMBERT', `… ${floors[3]} · ${floors[4]} · ${floors[5]}`], { font: `${Math.round(h * 0.2)}px Georgia, serif`, colour: '#4a3a2a', top: 0.32, step: 0.38 });
  },
};

/** Initials cut into the chestnut's bark, an old heart round them, a newer date under. */
export const CARVING: ClueMarkLook = {
  width: 0.26,
  height: 0.3,
  transparent: true,
  caption: 'Initials carved in the bark',
  paint: (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(58,40,26,0.9)';
    ctx.lineWidth = w * 0.02;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.3, w * 0.36, h * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    writeLines(ctx, w, h, ['A.V. + H.L.', '1961'], { font: `bold ${Math.round(h * 0.09)}px Georgia, serif`, colour: 'rgba(58,40,26,0.95)', top: 0.25, step: 0.12 });
    writeLines(ctx, w, h, [`24·XII·${ATTIC_PLAN.chest.code}`], { font: `${Math.round(h * 0.07)}px Georgia, serif`, colour: 'rgba(84,60,40,0.85)', top: 0.72, step: 0 });
  },
};

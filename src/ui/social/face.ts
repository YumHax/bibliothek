import type { PersonLook } from '@/world/people/looks';

/*
 * A person's painted portrait (`portrait.ts` caches it): a head-and-shoulders on a 100-unit square, lit from the
 * upper left. The look is their body's (skin, hair and its style, eyes, brows, jaw, nose, smile, freckles, beard,
 * glasses, hat, top and its accent, scarf, age), so the face in the book is the face met. Flat shapes with soft
 * gradients: an illustration, not a render.
 */

type G = CanvasRenderingContext2D;

function rgb(colour: number, factor = 1, alpha = 1): string {
  const r = Math.min(255, Math.round(((colour >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((colour >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((colour & 255) * factor));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** `colour` mixed towards white by `amount` (0..1). */
function lighten(colour: number, amount: number): string {
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((colour >> 16) & 255)},${mix((colour >> 8) & 255)},${mix(colour & 255)})`;
}

function parseHex(css: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
  return m ? parseInt(m[1]!, 16) : 0x777777;
}

/** Paints `look` on `g`, `s` pixels square, on a backdrop of `backdrop` (the tier's colour, `#rrggbb`). */
export function paintFace(g: G, s: number, look: PersonLook, backdrop: string): void {
  g.save();
  g.scale(s / 100, s / 100);
  backdropOf(g, parseHex(backdrop));
  const old = look.age === 'elder';
  const child = look.age === 'child';
  // A child sits lower in the frame, the head bigger for the body.
  g.translate(0, child ? 6 : 0);
  if (child) {
    g.translate(50, 50);
    g.scale(1.08, 1.08);
    g.translate(-50, -50);
  }
  if (look.hairStyle === 'long' || look.hairStyle === 'ponytail') hairBehind(g, look);
  shoulders(g, look);
  neck(g, look);
  head(g, look, old);
  hair(g, look, old);
  if (look.hat) hat(g, look);
  features(g, look, old);
  g.restore();
  vignette(g, s);
}

function backdropOf(g: G, colour: number): void {
  const bg = g.createRadialGradient(38, 30, 6, 50, 50, 78);
  bg.addColorStop(0, lighten(colour, 0.35));
  bg.addColorStop(0.55, rgb(colour, 0.85));
  bg.addColorStop(1, rgb(colour, 0.4));
  g.fillStyle = bg;
  g.fillRect(0, 0, 100, 100);
  // A faint diagonal weave, like a photographer's backdrop.
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (let x = -100; x < 100; x += 6) {
    g.beginPath();
    g.moveTo(x, 100);
    g.lineTo(x + 100, 0);
    g.stroke();
  }
}

function shoulders(g: G, look: PersonLook): void {
  const top = look.topColor;
  const body = g.createLinearGradient(20, 70, 80, 100);
  body.addColorStop(0, rgb(top, 1.12));
  body.addColorStop(1, rgb(top, 0.72));
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(4, 100);
  g.bezierCurveTo(6, 84, 18, 76, 36, 73);
  g.lineTo(64, 73);
  g.bezierCurveTo(82, 76, 94, 84, 96, 100);
  g.closePath();
  g.fill();
  const accent = look.topAccent;
  switch (look.top) {
    case 'stripes':
      g.save();
      g.clip();
      g.strokeStyle = rgb(accent, 1, 0.9);
      g.lineWidth = 2.6;
      for (let y = 78; y < 100; y += 6.5) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(100, y);
        g.stroke();
      }
      g.restore();
      break;
    case 'flannel':
      g.save();
      g.clip();
      g.strokeStyle = rgb(accent, 1, 0.45);
      g.lineWidth = 2;
      for (let x = 6; x < 100; x += 8) {
        g.beginPath();
        g.moveTo(x, 70);
        g.lineTo(x, 100);
        g.stroke();
      }
      for (let y = 78; y < 100; y += 8) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(100, y);
        g.stroke();
      }
      g.restore();
      break;
    case 'shirt':
    case 'jacket':
      // Lapels or a collar over the shirt underneath.
      g.fillStyle = rgb(accent, 1.05);
      g.beginPath();
      g.moveTo(42, 73);
      g.lineTo(50, 92);
      g.lineTo(58, 73);
      g.closePath();
      g.fill();
      g.fillStyle = rgb(top, look.top === 'jacket' ? 0.82 : 1.2);
      g.beginPath();
      g.moveTo(36, 73);
      g.lineTo(44, 74);
      g.lineTo(50, 92);
      g.lineTo(40, 84);
      g.closePath();
      g.moveTo(64, 73);
      g.lineTo(56, 74);
      g.lineTo(50, 92);
      g.lineTo(60, 84);
      g.closePath();
      g.fill();
      break;
    case 'hoodie':
      g.strokeStyle = rgb(top, 0.65);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(33, 74);
      g.quadraticCurveTo(50, 90, 67, 74);
      g.stroke();
      g.strokeStyle = rgb(accent, 1.2);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(46, 82);
      g.lineTo(45, 92);
      g.moveTo(54, 82);
      g.lineTo(55, 92);
      g.stroke();
      break;
    default:
      // A tee: a round neck, a print in the accent.
      g.strokeStyle = rgb(top, 0.7);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(41, 73.5);
      g.quadraticCurveTo(50, 80, 59, 73.5);
      g.stroke();
      g.fillStyle = rgb(accent, 1, 0.8);
      g.beginPath();
      g.arc(50, 90, 4, 0, Math.PI * 2);
      g.fill();
  }
  if (look.apron !== undefined) {
    g.fillStyle = rgb(look.apron);
    g.fillRect(38, 84, 24, 16);
    g.strokeStyle = rgb(look.apron, 0.7);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(40, 84);
    g.lineTo(44, 73);
    g.moveTo(60, 84);
    g.lineTo(56, 73);
    g.stroke();
  }
  if (look.scarf !== undefined) {
    g.fillStyle = rgb(look.scarf);
    g.beginPath();
    g.ellipse(50, 73.5, 13, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(53, 73, 5, 15);
  }
}

function neck(g: G, look: PersonLook): void {
  g.fillStyle = rgb(look.skin, 0.88);
  g.beginPath();
  g.moveTo(43, 58);
  g.lineTo(43, 72);
  g.quadraticCurveTo(50, 76, 57, 72);
  g.lineTo(57, 58);
  g.closePath();
  g.fill();
  // The jaw's shadow on the neck.
  g.fillStyle = rgb(look.skin, 0.68, 0.55);
  g.beginPath();
  g.ellipse(50, 61, 8, 3.5, 0, 0, Math.PI * 2);
  g.fill();
}

/** The head's outline: a skull over a jaw as wide as the look's, a chin at the bottom. */
function headPath(g: G, jaw: number): void {
  const w = 18 * jaw;
  g.beginPath();
  g.moveTo(50, 19);
  g.bezierCurveTo(63, 19, 70, 29, 69.5, 42);
  g.bezierCurveTo(69, 52, 50 + w, 60, 50 + w * 0.35, 64);
  g.quadraticCurveTo(50, 66.5, 50 - w * 0.35, 64);
  g.bezierCurveTo(50 - w, 60, 31, 52, 30.5, 42);
  g.bezierCurveTo(30, 29, 37, 19, 50, 19);
  g.closePath();
}

function head(g: G, look: PersonLook, old: boolean): void {
  const skin = look.skin;
  // Ears, behind the head's outline.
  g.fillStyle = rgb(skin, 0.92);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(50 + side * 19.5, 44, 3.4, 5.6, side * 0.15, 0, Math.PI * 2);
    g.fill();
  }
  headPath(g, look.jaw ?? 1);
  const face = g.createRadialGradient(43, 34, 3, 50, 44, 28);
  face.addColorStop(0, lighten(skin, 0.18));
  face.addColorStop(0.6, rgb(skin));
  face.addColorStop(1, rgb(skin, 0.8));
  g.fillStyle = face;
  g.fill();
  // Cheeks.
  g.fillStyle = 'rgba(220,90,90,0.12)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(50 + side * 10, 50, 4.5, 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (old) {
    g.strokeStyle = rgb(skin, 0.72, 0.6);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(42, 31);
    g.quadraticCurveTo(50, 29.5, 58, 31);
    g.moveTo(43, 33.5);
    g.quadraticCurveTo(50, 32.3, 57, 33.5);
    g.moveTo(41.5, 53);
    g.quadraticCurveTo(43.5, 56, 44, 58.5);
    g.moveTo(58.5, 53);
    g.quadraticCurveTo(56.5, 56, 56, 58.5);
    g.stroke();
  }
}

function hairFill(g: G, look: PersonLook, old: boolean): CanvasGradient {
  const base = old ? 0xbdbdbd : look.hair;
  const grad = g.createLinearGradient(35, 16, 62, 44);
  grad.addColorStop(0, lighten(base, 0.22));
  grad.addColorStop(0.5, rgb(base));
  grad.addColorStop(1, rgb(base, 0.7));
  return grad;
}

function hairBehind(g: G, look: PersonLook): void {
  g.fillStyle = hairFill(g, look, look.age === 'elder');
  g.beginPath();
  g.moveTo(30, 36);
  g.bezierCurveTo(26, 56, 27, 74, 31, 80);
  g.lineTo(69, 80);
  g.bezierCurveTo(73, 74, 74, 56, 70, 36);
  g.closePath();
  g.fill();
}

function hair(g: G, look: PersonLook, old: boolean): void {
  const style = look.hairStyle;
  if (style === 'bald') {
    // A shine on the crown.
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(44, 25, 6, 3, -0.4, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.fillStyle = hairFill(g, look, old);
  if (style === 'buzz') {
    g.globalAlpha = 0.75;
    g.beginPath();
    g.moveTo(31, 38);
    g.bezierCurveTo(31, 24, 39, 18.5, 50, 18.5);
    g.bezierCurveTo(61, 18.5, 69, 24, 69, 38);
    g.quadraticCurveTo(62, 27, 50, 27);
    g.quadraticCurveTo(38, 27, 31, 38);
    g.fill();
    g.globalAlpha = 1;
    return;
  }
  // The cap of hair with a fringe swept to one side.
  g.beginPath();
  g.moveTo(29.5, 42);
  g.bezierCurveTo(27, 22, 38, 15, 50, 15.5);
  g.bezierCurveTo(63, 15.5, 73, 23, 70.5, 42);
  g.quadraticCurveTo(68, 33, 63, 29);
  g.quadraticCurveTo(52, 34, 38, 28.5);
  g.quadraticCurveTo(33, 33, 29.5, 42);
  g.fill();
  if (style === 'curly') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.05 + (i / 8) * 0.9);
      g.beginPath();
      g.arc(50 + Math.cos(a) * 20, 37 + Math.sin(a) * 19, 4.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (style === 'bun') {
    g.beginPath();
    g.arc(50, 13, 7.5, 0, Math.PI * 2);
    g.fill();
  }
  if (style === 'ponytail') {
    g.beginPath();
    g.ellipse(70, 46, 4, 11, 0.35, 0, Math.PI * 2);
    g.fill();
  }
  // A highlight along the parting.
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(40, 21);
  g.quadraticCurveTo(50, 18, 60, 22);
  g.stroke();
}

function hat(g: G, look: PersonLook): void {
  const colour = look.hatColor ?? 0x34495e;
  const grad = g.createLinearGradient(30, 10, 70, 32);
  grad.addColorStop(0, rgb(colour, 1.2));
  grad.addColorStop(1, rgb(colour, 0.75));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(29, 33);
  g.bezierCurveTo(28, 17, 39, 11, 50, 11);
  g.bezierCurveTo(61, 11, 72, 17, 71, 33);
  g.closePath();
  g.fill();
  if (look.hat === 'cap') {
    g.fillStyle = rgb(colour, 0.65);
    g.beginPath();
    g.ellipse(58, 33, 18, 3.5, -0.05, 0, Math.PI * 2);
    g.fill();
  } else {
    // A beanie's ribbed turn-up.
    g.fillStyle = rgb(colour, 0.85);
    g.fillRect(29, 28, 42, 6);
    g.strokeStyle = rgb(colour, 0.6);
    g.lineWidth = 0.8;
    for (let x = 31; x < 70; x += 3) {
      g.beginPath();
      g.moveTo(x, 28.5);
      g.lineTo(x, 33.5);
      g.stroke();
    }
  }
}

function features(g: G, look: PersonLook, old: boolean): void {
  const skin = look.skin;
  // Brows.
  g.strokeStyle = rgb(old ? 0x9a9a9a : look.hair, 0.75);
  g.lineWidth = 1.7 * (look.brows ?? 1);
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(50 + side * 4, 37.5);
    g.quadraticCurveTo(50 + side * 8.5, 35, 50 + side * 13, 37);
    g.stroke();
  }
  // Eyes: the white, the iris, the pupil, a catch-light, the upper lid.
  for (const side of [-1, 1]) {
    const x = 50 + side * 8.5;
    g.fillStyle = '#f7f3ee';
    g.beginPath();
    g.ellipse(x, 42.5, 3.8, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rgb(look.eyes);
    g.beginPath();
    g.arc(x + 0.3, 42.6, 1.9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#141414';
    g.beginPath();
    g.arc(x + 0.3, 42.6, 0.95, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(x - 0.5, 41.8, 0.55, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = rgb(skin, 0.45);
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(x - 4, 42.2);
    g.quadraticCurveTo(x, 39.4, x + 4, 42.2);
    g.stroke();
  }
  // Nose: a soft shadow down one side, the nostril's curve.
  const nose = look.nose ?? 1;
  g.strokeStyle = rgb(skin, 0.7);
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(51.5, 44);
  g.quadraticCurveTo(53 + nose, 49 + nose * 1.5, 50.5, 51 + nose * 1.5);
  g.quadraticCurveTo(49, 51.6 + nose * 1.5, 47.8, 50.6 + nose * 1.5);
  g.stroke();
  // Mouth: lips a shade of the skin, a smile or a straight line.
  g.strokeStyle = rgb(skin, 0.55);
  g.fillStyle = 'rgba(160,70,70,0.55)';
  g.lineWidth = 1.2;
  g.beginPath();
  if (look.smile) {
    g.moveTo(45, 56.2);
    g.quadraticCurveTo(50, 60.4, 55, 56.2);
    g.quadraticCurveTo(50, 58, 45, 56.2);
    g.fill();
    g.stroke();
  } else {
    g.moveTo(45.5, 57.2);
    g.quadraticCurveTo(50, 58.2, 54.5, 57.2);
    g.stroke();
  }
  if (look.freckles) {
    g.fillStyle = rgb(skin, 0.7, 0.8);
    for (const [x, y] of [[41, 48], [43.5, 49.5], [45.5, 47.8], [54.5, 47.8], [56.5, 49.5], [59, 48]] as const) {
      g.beginPath();
      g.arc(x, y, 0.55, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (look.beard) {
    const full = look.beard === 'full';
    g.fillStyle = full ? hairFill(g, look, old) : rgb(old ? 0x9a9a9a : look.hair, 0.9, 0.3);
    g.beginPath();
    const w = 17 * (look.jaw ?? 1);
    g.moveTo(50 - w, 48);
    g.bezierCurveTo(50 - w, full ? 64 : 60, 44, full ? 70 : 66, 50, full ? 70.5 : 66.5);
    g.bezierCurveTo(56, full ? 70 : 66, 50 + w, full ? 64 : 60, 50 + w, 48);
    g.quadraticCurveTo(56, 54, 55, 55.5);
    g.quadraticCurveTo(50, 53.5, 45, 55.5);
    g.quadraticCurveTo(44, 54, 50 - w, 48);
    g.fill();
  }
  if (look.glasses !== undefined) {
    g.strokeStyle = rgb(look.glasses);
    g.lineWidth = 1.3;
    g.fillStyle = 'rgba(200,225,255,0.14)';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.roundRect(50 + side * 8.5 - 5.5, 39, 11, 7.5, 2.4);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    g.moveTo(47.5, 42);
    g.quadraticCurveTo(50, 40.8, 52.5, 42);
    g.stroke();
  }
}

function vignette(g: G, s: number): void {
  const v = g.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = v;
  g.fillRect(0, 0, s, s);
}

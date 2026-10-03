import { getPlatform } from '@/catalog/platforms';
import type { NoticeActions } from '@/notices';
import { CONSOLES, FAULTS, TOOLS, resaleOf, type BoardPart, type Fault, type ToolId } from '@/repair/consoles';
import type { HomeConsole, Workshop } from '@/repair/Workshop';
import { playPartClick, playPowerOn, playScrew, playScrub, playSolder } from '@/audio/repairSounds';
import { escapeHtml } from '../html';
import { ModalPanel } from '../ModalPanel';
import './repair.css';

export interface RepairPanelDeps {
  workshop: Workshop;
  notices: NoticeActions;
}

/** Where the job is: the shell's screws out, lifted, the fault found, the tool picked, the fix, the shell back and screwed, the test. */
type Step = 'unscrew' | 'lift' | 'find' | 'tool' | 'fix' | 'close' | 'screw' | 'test' | 'done';

/** How the parts are drawn on the board (viewBox 640 x 400) and named. */
const PARTS: Readonly<Record<BoardPart, { name: string; x: number; y: number; w: number; h: number }>> = {
  connector: { name: 'cartridge connector', x: 170, y: 82, w: 300, h: 44 },
  cpu: { name: 'main chip', x: 222, y: 170, w: 120, h: 76 },
  regulator: { name: 'voltage regulator', x: 452, y: 176, w: 44, h: 54 },
  capacitor: { name: 'capacitors', x: 380, y: 262, w: 120, h: 40 },
  fuse: { name: 'fuse', x: 118, y: 286, w: 62, h: 20 },
  battery: { name: 'battery terminals', x: 104, y: 150, w: 74, h: 112 },
  lens: { name: 'laser lens', x: 448, y: 96, w: 64, h: 64 },
  ribbon: { name: 'screen ribbon', x: 200, y: 66, w: 240, h: 22 },
};

/** Which parts each kind of board shows (the faulty one is always among them). */
const BOARDS: Readonly<Record<string, readonly BoardPart[]>> = {
  cart: ['connector', 'cpu', 'regulator', 'capacitor', 'fuse'],
  gb: ['ribbon', 'cpu', 'battery', 'capacitor', 'connector'],
  ps1: ['lens', 'cpu', 'regulator', 'capacitor', 'fuse'],
};

/** Pointer travel (px of the drawing) a scrub needs to come clean, and between two stroke sounds. */
const SCRUB_TRAVEL = 1400;
const STROKE = 90;
/** Joints a solder job takes (a capacitor: two legs out, then two in; a ribbon: four reflowed). */
const JOINTS: Readonly<Record<string, number>> = { capacitor: 2, ribbon: 4 };

/**
 * The kitchen table's console repair (docs/household.md "Repairing a console"): one broken console laid out on the
 * bench, mended by hand in a few short steps on a drawing of it. The shell's screws out one by one, the shell lifted,
 * the fault found on the board (the part that looks wrong; a healthy part only gets a "looks fine"), the right tool
 * from the tray (a wrong one is a word, no harm), the fix itself (scrubbed clean with the pointer held down, an old
 * part out and a new one in, joints soldered one by one), the shell back on and screwed, and the power switch: the
 * light comes on, the chime, `Workshop.fix`. Closing it halfway leaves the console as it was (the next opening starts
 * over). A `ModalLike`: `prepare(console)` first, then the Session opens it.
 */
export class RepairPanel extends ModalPanel {
  private readonly card: HTMLElement;
  private console: HomeConsole | null = null;
  private step: Step = 'unscrew';
  private screws: boolean[] = [];
  private message = '';
  /** The fix's progress: a scrub's travel (0..1), a swap's stage, the joints done. */
  private scrub = 0;
  private stroke = 0;
  private scrubbing = false;
  private last: { x: number; y: number } | null = null;
  private swapOut = false;
  private joints: boolean[] = [];
  private solderStage: 'out' | 'in' = 'out';

  constructor(container: HTMLElement, private readonly deps: RepairPanelDeps) {
    super(container, { className: 'ui-modal--centre repair-panel' });
    this.root.innerHTML = '<article class="repair ui-card" role="dialog" aria-modal="true" aria-label="Repairing a console"></article>';
    this.card = this.root.querySelector('.repair')!;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.root.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => {
      this.scrubbing = false;
      this.last = null;
    });
  }

  /** The console to mend at the next opening. */
  prepare(console: HomeConsole): void {
    this.console = console;
  }

  protected onOpened(): void {
    const console = this.console;
    this.step = 'unscrew';
    this.screws = Array.from({ length: console ? CONSOLES[console.platform].screws : 4 }, () => true);
    this.message = '';
    this.scrub = 0;
    this.stroke = 0;
    this.swapOut = false;
    this.solderStage = 'out';
    this.joints = Array.from({ length: console ? JOINTS[FAULTS[console.fault].part] ?? 2 : 2 }, () => false);
    this.render();
  }

  private get fault(): Fault | null {
    return this.console ? FAULTS[this.console.fault] : null;
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as Element;
    if (target === this.root || target.closest('[data-action="close"]')) {
      this.close();
      return;
    }
    const console = this.console;
    const fault = this.fault;
    if (!console || !fault) return;
    const el = target.closest<Element>('[data-hit]');
    const hit = el?.getAttribute('data-hit') ?? '';
    const tool = target.closest<HTMLElement>('[data-tool]')?.dataset.tool as ToolId | undefined;
    switch (this.step) {
      case 'unscrew':
      case 'screw': {
        if (!hit.startsWith('screw:')) return;
        const i = Number(hit.slice(6));
        const out = this.step === 'unscrew';
        if (this.screws[i] !== out) return;
        this.screws[i] = !out;
        playScrew(!out);
        if (out && this.screws.every((s) => !s)) this.go('lift');
        else if (!out && this.screws.every((s) => s)) this.go('test');
        else this.render();
        return;
      }
      case 'lift':
        if (target.closest('[data-hit="shell"]')) {
          playPartClick(false);
          this.go('find');
        }
        return;
      case 'find':
        if (!hit.startsWith('part:')) return;
        if (hit.slice(5) === fault.part) {
          this.message = fault.finding;
          this.go('tool');
        } else {
          const name = PARTS[hit.slice(5) as BoardPart].name;
          this.message = `The ${name} look${name.endsWith('s') ? '' : 's'} fine.`;
          this.render();
        }
        return;
      case 'tool':
        if (!tool) return;
        if (tool === fault.tool) {
          this.message = this.fixHint(fault);
          this.go('fix');
        } else {
          this.message = `Not with the ${TOOLS[tool].name.toLowerCase()}. ${fault.finding}`;
          this.render();
        }
        return;
      case 'fix':
        this.fixClick(hit, fault);
        return;
      case 'close':
        if (target.closest('[data-hit="shell"]')) {
          playPartClick(true);
          this.go('screw');
        }
        return;
      case 'test':
        if (hit === 'power') this.powerOn(console, fault);
        return;
      default:
        return;
    }
  }

  /** A swap's or a solder's click on the board. */
  private fixClick(hit: string, fault: Fault): void {
    if (fault.action === 'swap') {
      if (!this.swapOut && hit === `part:${fault.part}`) {
        this.swapOut = true;
        playPartClick(false);
        this.message = `The old ${PARTS[fault.part].name} is out. Seat the new one in its place.`;
        this.render();
      } else if (this.swapOut && hit === 'socket') {
        playPartClick(true);
        this.fixed();
      }
      return;
    }
    if (fault.action === 'solder' && hit.startsWith('joint:')) {
      const i = Number(hit.slice(6));
      if (this.joints[i]) return;
      this.joints[i] = true;
      playSolder();
      if (!this.joints.every(Boolean)) {
        this.render();
        return;
      }
      // A capacitor comes out on its two legs, then the new one goes in on two more.
      if (fault.part === 'capacitor' && this.solderStage === 'out') {
        this.solderStage = 'in';
        this.joints = this.joints.map(() => false);
        playPartClick(false);
        this.message = 'The old capacitor is out. Solder the new one’s legs in.';
        this.render();
        return;
      }
      this.fixed();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.step !== 'fix' || this.fault?.action !== 'scrub') return;
    const hit = (e.target as Element).closest('[data-hit]')?.getAttribute('data-hit');
    if (hit !== `part:${this.fault.part}`) return;
    this.scrubbing = true;
    this.last = { x: e.clientX, y: e.clientY };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.scrubbing || !this.last || this.step !== 'fix') return;
    const svg = this.card.querySelector('svg');
    const scale = svg ? 640 / svg.getBoundingClientRect().width : 1;
    const moved = Math.hypot(e.clientX - this.last.x, e.clientY - this.last.y) * scale;
    this.last = { x: e.clientX, y: e.clientY };
    this.scrub = Math.min(1, this.scrub + moved / SCRUB_TRAVEL);
    this.stroke += moved;
    if (this.stroke > STROKE) {
      this.stroke = 0;
      playScrub();
    }
    const grime = this.card.querySelector<SVGElement>('[data-grime]');
    if (grime) grime.setAttribute('opacity', String(0.85 * (1 - this.scrub)));
    if (this.scrub >= 1) {
      this.scrubbing = false;
      this.fixed();
    }
  }

  /** The fix is done: the shell goes back on. */
  private fixed(): void {
    const fault = this.fault;
    this.message = fault ? `${fault.done} Now the shell back on.` : '';
    this.go('close');
  }

  private powerOn(console: HomeConsole, fault: Fault): void {
    playPowerOn();
    this.deps.workshop.fix(console.id);
    const platform = getPlatform(console.platform);
    this.message = 'The power light comes on, and the test cartridge’s title screen comes up clean.';
    this.go('done');
    this.deps.notices.reward({ title: `Mended: the ${platform.shortName}`, detail: `${fault.done}\nTV REPAIR on Park Street pays ${resaleOf(console.platform)} coins for a working one.` });
  }

  private go(step: Step): void {
    this.step = step;
    this.render();
  }

  private fixHint(fault: Fault): string {
    switch (fault.action) {
      case 'scrub':
        return `Hold the ${fault.tool === 'brush' ? 'brush' : 'cotton bud'} down on the ${PARTS[fault.part].name} and work it back and forth until it is clean.`;
      case 'swap':
        return `Pull the old ${PARTS[fault.part].name} out, then seat the new one from the box.`;
      default:
        return fault.part === 'capacitor' ? 'Heat each leg of the bad capacitor to free it.' : 'Touch the iron to each joint along the ribbon.';
    }
  }

  private stepLine(): string {
    switch (this.step) {
      case 'unscrew': return `Undo the ${this.screws.length} screws holding the shell (${this.screws.filter((s) => !s).length} out).`;
      case 'lift': return 'Lift the shell off.';
      case 'find': return 'Find what is wrong: look the board over.';
      case 'tool': return 'Pick the right thing off the tray.';
      case 'fix': return '';
      case 'close': return 'Put the shell back on.';
      case 'screw': return `Screw it shut (${this.screws.filter(Boolean).length} of ${this.screws.length}).`;
      case 'test': return 'Plug it in and switch it on.';
      default: return '';
    }
  }

  private render(): void {
    const console = this.console;
    const fault = this.fault;
    if (!console || !fault) {
      this.card.innerHTML = '<p>Nothing on the table to mend.</p><footer><button type="button" class="ui-btn" data-action="close" data-autofocus>Close</button></footer>';
      return;
    }
    const platform = getPlatform(console.platform);
    const toolsOn = this.step === 'tool';
    const tools = (Object.keys(TOOLS) as ToolId[]).map((id) => `<button type="button" class="repair__tool${this.step === 'fix' && fault.tool === id ? ' repair__tool--in-hand' : ''}" data-tool="${id}" ${toolsOn ? '' : 'disabled'} title="${escapeHtml(TOOLS[id].name)}"><span aria-hidden="true">${TOOLS[id].icon}</span>${escapeHtml(TOOLS[id].name)}</button>`).join('');
    const line = [this.message, this.stepLine()].filter(Boolean).join(' ');
    this.card.innerHTML = `
      <header>
        <h2>The kitchen table · a broken ${escapeHtml(platform.shortName)}</h2>
        <p class="repair__job">From ${escapeHtml(console.from)}: “${escapeHtml(fault.symptom)}”</p>
      </header>
      <div class="repair__bench">${this.drawing(console, fault)}</div>
      <p class="repair__step" aria-live="polite">${escapeHtml(line)}</p>
      <div class="repair__tools">${tools}</div>
      <footer><button type="button" class="ui-btn" data-action="close" ${this.step === 'done' ? 'data-autofocus' : ''}>${this.step === 'done' ? 'Done' : 'Put it down'}</button></footer>`;
  }

  /** The bench seen from above: the board and its parts, the shell over it (with its screws) until lifted. */
  private drawing(console: HomeConsole, fault: Fault): string {
    const spec = CONSOLES[console.platform];
    const board = BOARDS[console.platform === 'gb' ? 'gb' : console.platform === 'ps1' ? 'ps1' : 'cart']!;
    const parts = board.includes(fault.part) ? board : [...board, fault.part];
    const shellOn = this.step === 'unscrew' || this.step === 'lift' || this.step === 'screw' || this.step === 'test' || this.step === 'done';
    const ghost = this.step === 'close';
    const fixing = this.step === 'fix';
    const fixedNow = this.step === 'close' || shellOn && this.step !== 'unscrew' && this.step !== 'lift';
    const svg: string[] = [];
    // The bench mat, the board and its traces.
    svg.push('<rect x="0" y="0" width="640" height="400" fill="#3c5a4c"/>');
    svg.push('<rect x="80" y="56" width="480" height="290" rx="8" fill="#2f6b45" stroke="#1f4a30" stroke-width="3"/>');
    for (let i = 0; i < 9; i++) svg.push(`<path d="M${100 + i * 50} 340 V${300 - (i % 3) * 30} H${130 + i * 46}" stroke="#c9a54a" stroke-opacity="0.35" stroke-width="2" fill="none"/>`);
    for (const id of parts) svg.push(this.part(id, id === fault.part, fault, fixing, fixedNow));
    if (fixing && fault.action === 'swap' && this.swapOut) {
      const p = PARTS[fault.part];
      svg.push(`<rect data-hit="socket" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="#1a1a1a" stroke="#f0d070" stroke-width="2" stroke-dasharray="6 4"/>`);
      svg.push(`<g opacity="0.95" transform="translate(530 330)"><rect x="-44" y="-18" width="88" height="36" rx="4" fill="#d9cfb2"/><text x="0" y="5" font-size="13" text-anchor="middle" fill="#2a2622">NEW PART</text></g>`);
    }
    if (fixing && fault.action === 'solder') {
      const p = PARTS[fault.part];
      this.joints.forEach((done, i) => {
        const x = p.x + ((i + 0.5) / this.joints.length) * p.w;
        const y = p.y + p.h + 8;
        svg.push(`<circle data-hit="joint:${i}" cx="${x}" cy="${y}" r="9" fill="${done ? '#e8ecf0' : '#7a6a4a'}" stroke="${done ? '#ffffff' : '#f0d070'}" stroke-width="2"/>`);
      });
    }
    if (shellOn || ghost) {
      const screwsAt = screwPositions(this.screws.length);
      svg.push(`<g data-hit="shell" class="repair__shell${ghost ? ' repair__shell--ghost' : ''}">`);
      svg.push(`<rect x="60" y="36" width="520" height="330" rx="14" fill="${spec.shell}" stroke="#00000055" stroke-width="3"/>`);
      svg.push(`<rect x="60" y="250" width="520" height="34" fill="${spec.band}"/>`);
      svg.push(`<text x="320" y="150" font-size="34" text-anchor="middle" fill="#00000044" font-weight="bold">${escapeHtml(getPlatform(console.platform).shortName)}</text>`);
      if (!ghost) {
        const lit = this.step === 'done';
        svg.push(`<g data-hit="power" class="repair__power"><rect x="96" y="300" width="70" height="36" rx="6" fill="#2a2a2e"/><text x="131" y="323" font-size="13" text-anchor="middle" fill="#eee">POWER</text></g>`);
        svg.push(`<circle cx="190" cy="318" r="8" fill="${lit ? '#ff3a2a' : '#5a2020'}" ${lit ? 'class="repair__led--on"' : ''}/>`);
        screwsAt.forEach(([x, y], i) => {
          const there = this.screws[i];
          svg.push(`<g data-hit="screw:${i}" class="repair__screw${there ? '' : ' repair__screw--out'}"><circle cx="${x}" cy="${y}" r="13" fill="${there ? '#9aa0a8' : '#00000033'}" stroke="#3a3e44" stroke-width="2"/>${there ? `<path d="M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}" stroke="#3a3e44" stroke-width="3"/>` : ''}</g>`);
        });
      }
      svg.push('</g>');
    }
    return `<svg class="repair__svg${this.step === 'find' ? ' repair__svg--finding' : ''}" viewBox="0 0 640 400" role="img" aria-label="The console on the bench">${svg.join('')}</svg>`;
  }

  /** One part of the board: drawn healthy, or as the fault shows on it (until mended). */
  private part(id: BoardPart, faulty: boolean, fault: Fault, fixing: boolean, fixedNow: boolean): string {
    const p = PARTS[id];
    const bad = faulty && !fixedNow;
    if (faulty && fixing && fault.action === 'swap' && this.swapOut) return '';
    const hit = `data-hit="part:${id}"`;
    const grime = (opacity: number) => `<rect data-grime x="${p.x - 4}" y="${p.y - 4}" width="${p.w + 8}" height="${p.h + 8}" rx="6" fill="#8a9a6a" opacity="${opacity}" pointer-events="none"/>`;
    const scrubbed = fixing && fault.action === 'scrub' ? 0.85 * (1 - this.scrub) : 0.85;
    switch (id) {
      case 'connector': {
        const pins = Array.from({ length: 24 }, (_, i) => {
          const x = p.x + 8 + i * ((p.w - 16) / 23);
          const bent = bad && fault.part === 'connector' && fault.action === 'swap' && i % 3 === 1;
          return `<rect x="${x}" y="${p.y + 8 + (bent ? 6 : 0)}" width="4" height="${p.h - 16}" fill="${bad && fault.action === 'swap' ? '#4a4030' : '#d8b04a'}" ${bent ? `transform="rotate(18 ${x} ${p.y + 22})"` : ''}/>`;
        }).join('');
        return `<g ${hit} class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="#1c1c1c"/>${pins}${bad && fault.action === 'scrub' ? grime(scrubbed) : ''}</g>`;
      }
      case 'cpu':
        return `<g ${hit} class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="#141414"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 5}" font-size="14" text-anchor="middle" fill="#aaa">CPU</text></g>`;
      case 'regulator':
        return `<g ${hit} class="repair__part"><rect x="${p.x}" y="${p.y + 14}" width="${p.w}" height="${p.h - 14}" fill="#2e2e30"/><rect x="${p.x + 4}" y="${p.y}" width="${p.w - 8}" height="18" fill="#9aa0a8"/></g>`;
      case 'capacitor': {
        const caps = [0, 1, 2].map((i) => {
          const cx = p.x + 20 + i * 40;
          const cy = p.y + p.h / 2;
          // The bad one (the middle) until it is out; then the new one stands in its place.
          const leak = bad && i === 1 && !(fixing && this.solderStage === 'in');
          return `<circle cx="${cx}" cy="${cy}" r="16" fill="${leak ? '#7a5a2a' : '#2a3f8f'}" stroke="${leak ? '#c8b07a' : '#9ab0e0'}" stroke-width="${leak ? 4 : 2}"/>${leak ? `<circle cx="${cx}" cy="${cy}" r="7" fill="#d8c890"/>` : `<path d="M${cx - 8} ${cy} H${cx + 8}" stroke="#9ab0e0" stroke-width="2"/>`}`;
        }).join('');
        return `<g ${hit} class="repair__part">${caps}</g>`;
      }
      case 'fuse':
        return `<g ${hit} class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${bad ? '#5a4a3a' : '#cfe3ea'}" stroke="#9aa0a8" stroke-width="3"/><path d="M${p.x + 8} ${p.y + p.h / 2} H${p.x + p.w - 8}" stroke="${bad ? '#2a2018' : '#888'}" stroke-width="2"/></g>`;
      case 'battery':
        return `<g ${hit} class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="#3a3a3e"/><path d="M${p.x + 14} ${p.y + 20} l10 8 l-10 8 l10 8 l-10 8" stroke="#c8c8c8" stroke-width="3" fill="none"/><path d="M${p.x + 50} ${p.y + 70} l10 8 l-10 8 l10 8" stroke="#c8c8c8" stroke-width="3" fill="none"/>${bad ? grime(scrubbed).replace('#8a9a6a', '#e8eedc') : ''}</g>`;
      case 'lens':
        return `<g ${hit} class="repair__part"><circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="${p.w / 2}" fill="#2a2a2e"/><circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="11" fill="#7ab0c8"/>${bad ? `<circle data-grime cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="14" fill="#b8b0a0" opacity="${scrubbed}" pointer-events="none"/>` : ''}</g>`;
      case 'ribbon': {
        const loose = bad;
        return `<g ${hit} class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#d68a2a"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${p.x + 10 + i * 19} ${p.y + 2} V${p.y + p.h - 2}" stroke="${loose && i % 4 === 2 ? '#5a3010' : '#f0c070'}" stroke-width="2"/>`).join('')}</g>`;
      }
    }
  }
}

/** The shell's screws: its corners first, then midway along the long sides. */
function screwPositions(count: number): [number, number][] {
  const all: [number, number][] = [[92, 66], [548, 66], [92, 336], [548, 336], [320, 60], [320, 342]];
  return all.slice(0, count);
}

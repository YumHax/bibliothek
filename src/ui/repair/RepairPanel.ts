import { getPlatform } from '@/catalog/platforms';
import type { NoticeActions } from '@/notices';
import { CONSOLES, FAULTS, TOOLS, faultOf, resaleOf, type BoardPart, type Fault, type ToolId } from '@/repair/consoles';
import type { BenchState } from '@/repair/Workshop';
import type { HomeConsole, Workshop } from '@/repair/Workshop';
import { playPartClick, playPowerOn, playScrew, playScrub, playSolder } from '@/audio/repairSounds';
import { escapeHtml } from '../html';
import { CardPanel } from '../panel/CardPanel';
import { attr, html, raw, type Html } from '../panel/html';
import { formatCoins } from '@/text/money';
import { emptyBenchArt, toolArt } from './repairArt';
import './repair.css';

interface RepairPanelDeps {
  workshop: Workshop;
  notices: NoticeActions;
  /** A neighbour's help at a step (`social/building/student.repairHint`): the part to look at, the tool to take; null without it. */
  hint?: (step: 'find' | 'tool', name: string) => string | null;
}

/** Where the job is: the shell's screws out, lifted, the fault found, the tool picked, the fix, the shell back and screwed, the test. */
type Step = 'unscrew' | 'lift' | 'find' | 'tool' | 'fix' | 'close' | 'screw' | 'test' | 'done';
const STEPS: readonly Step[] = ['unscrew', 'lift', 'find', 'tool', 'fix', 'close', 'screw', 'test', 'done'];

/** The job as the pips over the bench name it: each stage and the steps it covers. */
const STAGES: readonly { label: string; steps: readonly Step[] }[] = [
  { label: 'Open it', steps: ['unscrew', 'lift'] },
  { label: 'Find the fault', steps: ['find'] },
  { label: 'Mend it', steps: ['tool', 'fix'] },
  { label: 'Close it', steps: ['close', 'screw'] },
  { label: 'Switch on', steps: ['test', 'done'] },
];

/** The drawing's size (its viewBox): the hit buttons over it are placed in its units, as percentages. */
const VIEW_W = 640;
const VIEW_H = 400;

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

/** The shell, and the power switch on it. */
const SHELL = { x: 60, y: 36, w: 520, h: 330 };
const POWER = { x: 96, y: 300, w: 70, h: 36 };

/** Pointer travel (px of the drawing) a scrub needs to come clean, and between two stroke sounds. */
const SCRUB_TRAVEL = 1400;
const STROKE = 90;
/** One stroke of the brush from a key, a controller press or a click (of the whole scrub). */
const KEY_STROKE = 0.125;
/** Joints a solder job takes (a capacitor: two legs out, then two in; a ribbon: four reflowed). */
const JOINTS: Readonly<Record<string, number>> = { capacitor: 2, ribbon: 4 };

/** A button over the drawing: where it lies (drawing units), what it is called, its round or square ring. */
interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  round?: boolean;
}

/**
 * The kitchen table's console repair (docs/household.md "Repairing a console"): one broken console laid out on the
 * bench, mended by hand in a few short steps on a drawing of it. The shell's screws out one by one, the shell lifted,
 * the fault found on the board (the part that looks wrong; a healthy part only gets a "looks fine" and a shake), the
 * right tool from the tray (a wrong one is a word, no harm), the fix itself (scrubbed clean, an old part out and a new
 * one in, joints soldered one by one), the shell back on and screwed, and the power switch: the light comes on, the
 * chime, `Workshop.fix`. What can be touched at a step is a button laid over the drawing (`Hit`): the mouse clicks
 * it, the arrows and the D-pad walk to it, Enter or A presses it; a scrub is the pointer held down and rubbed, or the
 * arrows left and right (a press of Enter or A) on the dirty part, a stroke each. The pips over the bench say where
 * the job is; the manual's note under it says what was found and what is next; the tool in hand is drawn by the part
 * it works on. Closing it halfway keeps the job where it stands (`Workshop.keepBench`, saved: the next opening picks it
 * up). A `ModalLike`: `prepare(console)` first, then the Session opens it. The drawing is SVG built as text (`raw`):
 * nothing in it comes from the player.
 */
export class RepairPanel extends CardPanel {
  private console: HomeConsole | null = null;
  private step: Step = 'unscrew';
  private screws: boolean[] = [];
  private message = '';
  /** The fix's progress: a scrub's travel (0..1), a swap's stage, the joints done. */
  private scrub = 0;
  private stroke = 0;
  private scrubbing = false;
  /** The pointer moved while scrubbing: the click its release makes is not another stroke. */
  private dragged = false;
  private last: { x: number; y: number } | null = null;
  private swapOut = false;
  private joints: boolean[] = [];
  private solderStage: 'out' | 'in' = 'out';
  /** The hit or tool just turned down ("looks fine", the wrong tool): it shakes once. */
  private nope: string | null = null;

  constructor(container: HTMLElement, private readonly deps: RepairPanelDeps) {
    super(container, { className: 'repair-panel', cardClass: 'repair ui-card', title: 'Repairing a console', dismiss: 'Put it down', header: false });
    this.listen(this.root, 'click', (e) => this.onClick(e));
    this.listen(this.root, 'pointerdown', (e) => this.onPointerDown(e));
    this.listen(this.root, 'pointermove', (e) => this.onPointerMove(e));
    this.listen(window, 'pointerup', () => {
      this.scrubbing = false;
      this.last = null;
      // The click a rub's release makes comes in this same task; past it, a drag must not swallow the next key's stroke.
      window.setTimeout(() => (this.dragged = false), 0);
    });
  }

  /** The console to mend at the next opening. */
  prepare(console: HomeConsole): void {
    this.console = console;
  }

  protected override onOpened(): void {
    const console = this.console;
    this.nope = null;
    // Closed midway, the console waits on the table as it was left: its screws out, the fault found.
    const kept = console ? this.deps.workshop.benchOf(console.id) : null;
    if (kept && STEPS.includes(kept.step as Step)) {
      Object.assign(this, kept, { step: kept.step as Step, screws: [...kept.screws], joints: [...kept.joints], message: 'Where you left it on the table.' });
      super.onOpened();
      return;
    }
    this.step = 'unscrew';
    this.screws = Array.from({ length: console ? CONSOLES[console.platform].screws : 4 }, () => true);
    this.message = '';
    this.scrub = 0;
    this.stroke = 0;
    this.swapOut = false;
    this.solderStage = 'out';
    this.joints = Array.from({ length: console ? JOINTS[FAULTS[console.fault].part] ?? 2 : 2 }, () => false);
    super.onOpened();
  }

  protected override onClosed(): void {
    const console = this.console;
    if (!console) return;
    // Mended, the job is over; otherwise kept where it stands (unless nothing was done yet).
    const bench: BenchState | null = this.step === 'done' || (this.step === 'unscrew' && this.screws.every((s) => s)) ? null : { step: this.step, screws: [...this.screws], scrub: this.scrub, stroke: this.stroke, swapOut: this.swapOut, joints: [...this.joints], solderStage: this.solderStage };
    this.deps.workshop.keepBench(console.id, bench);
  }

  protected override dismissLabel(): string {
    return this.step === 'done' ? 'Done' : 'Put it down';
  }

  protected override dismissFocused(): boolean {
    return this.step === 'done' || !this.console;
  }

  private get fault(): Fault | null {
    return this.console ? faultOf(this.console) : null;
  }

  /** A press on the bench: what it does depends on the step (a screw, the shell, a part, a tool, the fix, the power switch). */
  private onClick(e: MouseEvent): void {
    const target = e.target as Element;
    const console = this.console;
    const fault = this.fault;
    if (!console || !fault) return;
    const hit = target.closest<HTMLElement>('[data-hit]')?.dataset.hit ?? '';
    const tool = target.closest<HTMLElement>('[data-tool]')?.dataset.tool as ToolId | undefined;
    if (!hit && !tool) return;
    this.nope = null;
    switch (this.step) {
      case 'unscrew':
      case 'screw':
        this.screwClick(hit);
        return;
      case 'lift':
        if (hit === 'shell') this.shellClick(false, 'find');
        return;
      case 'find':
        this.findClick(hit, fault);
        return;
      case 'tool':
        this.toolClick(tool, fault);
        return;
      case 'fix':
        this.fixClick(hit, fault);
        return;
      case 'close':
        if (hit === 'shell') this.shellClick(true, 'screw');
        return;
      case 'test':
        if (hit === 'power') this.powerOn(console);
        return;
      default:
        return;
    }
  }

  /** A screw turned: out while opening the case, in while closing it; the last one moves the step on. */
  private screwClick(hit: string): void {
    if (!hit.startsWith('screw:')) return;
    const i = Number(hit.slice(6));
    const out = this.step === 'unscrew';
    if (this.screws[i] !== out) return;
    this.screws[i] = !out;
    playScrew(!out);
    if (out && this.screws.every((s) => !s)) this.go('lift');
    else if (!out && this.screws.every((s) => s)) this.go('test');
    else this.refresh();
  }

  /** The shell lifted off (to look for the fault) or put back on (to screw it shut). */
  private shellClick(on: boolean, next: Step): void {
    playPartClick(on);
    this.go(next);
  }

  /** A part pointed at on the board: the fault's part names the finding, any other looks fine. */
  private findClick(hit: string, fault: Fault): void {
    if (!hit.startsWith('part:')) return;
    if (hit.slice(5) === fault.part) {
      this.message = fault.finding;
      this.go('tool');
    } else {
      const name = PARTS[hit.slice(5) as BoardPart].name;
      this.message = `The ${name} look${name.endsWith('s') ? '' : 's'} fine.`; // convention-ok: the verb agrees with the noun, not a count
      this.nope = hit;
      this.refresh();
    }
  }

  /** A tool picked up: the fault's tool says how to go about the fix, another is turned down. */
  private toolClick(tool: ToolId | undefined, fault: Fault): void {
    if (!tool) return;
    if (tool === fault.tool) {
      playPartClick(false, 0.18);
      this.message = this.fixHint(fault);
      this.go('fix');
    } else {
      this.message = `Not with the ${TOOLS[tool].name.toLowerCase()}. ${fault.finding}`;
      this.nope = `tool:${tool}`;
      this.refresh();
    }
  }

  /** A swap's, a solder's or a scrub's press on the board. */
  private fixClick(hit: string, fault: Fault): void {
    if (fault.action === 'scrub') {
      // The release of a rub with the pointer is no extra stroke; a plain press (a key, A, a tap) is one.
      if (hit === `part:${fault.part}` && !this.dragged) this.strokeOnce();
      this.dragged = false;
      return;
    }
    if (fault.action === 'swap') {
      if (!this.swapOut && hit === `part:${fault.part}`) {
        this.swapOut = true;
        playPartClick(false);
        this.message = `The old ${PARTS[fault.part].name} is out. Seat the new one in its place.`;
        this.refresh();
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
        this.refresh();
        return;
      }
      // A capacitor comes out on its two legs, then the new one goes in on two more.
      if (fault.part === 'capacitor' && this.solderStage === 'out') {
        this.solderStage = 'in';
        this.joints = this.joints.map(() => false);
        playPartClick(false);
        this.message = 'The old capacitor is out. Solder the new one’s legs in.';
        this.refresh();
        return;
      }
      this.fixed();
    }
  }

  /** The arrows left and right on the dirty part rub it, a stroke each way; anything else walks the focus. */
  protected override onMove(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    if (direction === 'up' || direction === 'down' || !this.scrubFocused()) return false;
    this.strokeOnce();
    return true;
  }

  /** The focus is on the part a scrub is working on. */
  private scrubFocused(): boolean {
    const fault = this.fault;
    if (this.step !== 'fix' || fault?.action !== 'scrub') return false;
    return (document.activeElement as HTMLElement | null)?.dataset.hit === `part:${fault.part}`;
  }

  private onPointerDown(e: PointerEvent): void {
    this.dragged = false;
    if (this.step !== 'fix' || this.fault?.action !== 'scrub') return;
    const hit = (e.target as Element).closest<HTMLElement>('[data-hit]')?.dataset.hit;
    if (hit !== `part:${this.fault.part}`) return;
    this.scrubbing = true;
    this.last = { x: e.clientX, y: e.clientY };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.scrubbing || !this.last || this.step !== 'fix') return;
    const svg = this.card.querySelector('svg.repair__svg');
    const scale = svg ? VIEW_W / svg.getBoundingClientRect().width : 1;
    const moved = Math.hypot(e.clientX - this.last.x, e.clientY - this.last.y) * scale;
    this.last = { x: e.clientX, y: e.clientY };
    if (moved > 2) this.dragged = true;
    this.stroke += moved;
    if (this.stroke > STROKE) {
      this.stroke = 0;
      playScrub();
      this.wiggle();
    }
    this.scrubBy(moved / SCRUB_TRAVEL);
  }

  /** One rub from a key, a controller or a tap: a stroke's sound, the tool wiggles, the grime fades a step. */
  private strokeOnce(): void {
    playScrub();
    this.wiggle();
    this.scrubBy(KEY_STROKE);
  }

  /** The grime fades by `amount` of the whole scrub; clean, the fix is done. */
  private scrubBy(amount: number): void {
    this.scrub = Math.min(1, this.scrub + amount);
    const grime = this.card.querySelector<SVGElement>('[data-grime]');
    if (grime) grime.setAttribute('opacity', String(0.85 * (1 - this.scrub)));
    if (this.scrub >= 1) {
      this.scrubbing = false;
      this.fixed();
    }
  }

  /** The tool in hand works once (its little animation restarted). */
  private wiggle(): void {
    const hand = this.card.querySelector<HTMLElement>('.repair__in-hand');
    if (!hand) return;
    hand.classList.remove('repair__in-hand--work');
    void hand.offsetWidth;
    hand.classList.add('repair__in-hand--work');
  }

  /** The fix is done: the shell goes back on. */
  private fixed(): void {
    const fault = this.fault;
    this.message = fault ? `${fault.done} Now the shell back on.` : '';
    this.go('close');
  }

  private powerOn(console: HomeConsole): void {
    playPowerOn();
    this.deps.workshop.fix(console.id);
    const platform = getPlatform(console.platform);
    this.message = 'The power light comes on, and the test cartridge’s title screen comes up clean.';
    this.go('done');
    this.deps.notices.slip({ title: `Mended: the ${platform.shortName}`, detail: `TV REPAIR on Park Street pays ${formatCoins(resaleOf(console.platform))} for it.` });
  }

  private go(step: Step): void {
    this.step = step;
    // A new step's first thing to touch takes the focus (`data-autofocus`), not whatever lands at the old one's place.
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.refresh();
  }

  private fixHint(fault: Fault): string {
    switch (fault.action) {
      case 'scrub':
        return `Work the ${fault.tool === 'brush' ? 'brush' : 'cotton bud'} back and forth on the ${PARTS[fault.part].name} until it is clean.`;
      case 'swap':
        return `Pull the old ${PARTS[fault.part].name} out, then seat the new one from the box.`;
      default:
        return fault.part === 'capacitor' ? 'Heat each leg of the bad capacitor to free it.' : 'Touch the iron to each joint along the ribbon.';
    }
  }

  /** A neighbour's word on the step, naming the faulty part or the right tool, if one helps. */
  private hintFor(step: 'find' | 'tool'): string | null {
    const fault = this.fault;
    if (!fault || !this.deps.hint) return null;
    return this.deps.hint(step, step === 'find' ? PARTS[fault.part].name : TOOLS[fault.tool].name.toLowerCase());
  }

  private stepLine(): string {
    switch (this.step) {
      case 'unscrew': return this.screws.every(Boolean) ? 'Undo the screws holding the shell.' : `Undo the screws holding the shell: ${this.screws.filter(Boolean).length} still in.`;
      case 'lift': return 'Lift the shell off.';
      case 'find': return this.hintFor('find') ?? 'Look the board over for what is wrong.';
      case 'tool': return this.hintFor('tool') ?? 'Pick the right thing off the tray.';
      case 'fix': return '';
      case 'close': return 'Put the shell back on.';
      case 'screw': return `Screw it shut: ${this.screws.filter((s) => !s).length} to go.`;
      case 'test': return 'Plug it in and switch it on.';
      default: return '';
    }
  }

  protected render(): Html {
    const console = this.console;
    const fault = this.fault;
    if (!console || !fault) {
      return html`<div class="repair__empty">${raw(emptyBenchArt())}<p>Nothing on the table to mend. A console bought broken waits here till you get round to it.</p></div>`;
    }
    const platform = getPlatform(console.platform);
    const toolsOn = this.step === 'tool';
    const tools = (Object.keys(TOOLS) as ToolId[]).map((id) => {
      const inHand = this.step === 'fix' && fault.tool === id;
      const nope = this.nope === `tool:${id}`;
      return html`<button type="button" class="repair__tool${inHand ? ' repair__tool--in-hand' : ''}${nope ? ' repair__tool--nope' : ''}" data-tool="${id}"${attr('disabled', !toolsOn)}${attr('data-autofocus', toolsOn && id === 'brush')}>${raw(toolArt(id))}<span>${TOOLS[id].name}</span></button>`;
    });
    const note = [this.message, this.stepLine()].filter(Boolean).join(' ');
    return html`<header class="repair__head">
        <div class="repair__ticket${this.step === 'done' ? ' repair__ticket--done' : ''}">
          <h2>A broken ${platform.shortName}</h2>
          <p class="repair__job">From ${console.from}: “${fault.symptom}”</p>
          <span class="repair__stamp" aria-hidden="true">Works</span>
        </div>
        <ol class="repair__stages" aria-label="The job">${STAGES.map((stage, i) => {
          const now = stage.steps.includes(this.step) && this.step !== 'done';
          const done = this.step === 'done' || STAGES.findIndex((s) => s.steps.includes(this.step)) > i;
          return html`<li class="repair__stage${now ? ' repair__stage--now' : ''}${done ? ' repair__stage--done' : ''}"${now ? html` aria-current="step"` : ''}>${stage.label}</li>`;
        })}</ol>
      </header>
      <div class="repair__bench">${raw(this.drawing(console, fault))}${this.hits(fault)}${this.inHand(fault)}</div>
      <p class="repair__note">${note}</p>
      <div class="repair__tools" role="group" aria-label="The tray">${tools}</div>`;
  }

  /** What can be touched now, as buttons laid over the drawing (the first one takes the focus at a new step). */
  private hits(fault: Fault): Html {
    const list = this.hitList(fault);
    return html`<div class="repair__hits">${list.map(
      (hit, i) => html`<button type="button" class="repair__hit${hit.round ? ' repair__hit--round' : ''}${this.nope === hit.id ? ' repair__hit--nope' : ''}${this.step === 'find' ? ' repair__hit--look' : ''}" data-hit="${hit.id}" aria-label="${hit.label}" style="--x:${pct(hit.x, VIEW_W)};--y:${pct(hit.y, VIEW_H)};--w:${pct(hit.w, VIEW_W)};--h:${pct(hit.h, VIEW_H)}"${attr('data-autofocus', i === 0)}></button>`,
    )}</div>`;
  }

  private hitList(fault: Fault): Hit[] {
    const screwHits = (wantIn: boolean): Hit[] =>
      screwPositions(this.screws.length)
        .map(([x, y], i): Hit | null => (this.screws[i] === wantIn ? { id: `screw:${i}`, x: x - 18, y: y - 18, w: 36, h: 36, label: wantIn ? 'Undo this screw' : 'Screw this one back in', round: true } : null))
        .filter((h): h is Hit => h !== null);
    const partHit = (id: BoardPart, label = PARTS[id].name): Hit => {
      const p = PARTS[id];
      return { id: `part:${id}`, x: p.x - 6, y: p.y - 6, w: p.w + 12, h: p.h + 12, label, round: id === 'lens' };
    };
    switch (this.step) {
      case 'unscrew': return screwHits(true);
      case 'screw': return screwHits(false);
      case 'lift': return [{ id: 'shell', ...SHELL, label: 'Lift the shell off' }];
      case 'close': return [{ id: 'shell', ...SHELL, label: 'Put the shell back on' }];
      case 'find': return this.boardParts(fault).map((id) => partHit(id, `Look at the ${PARTS[id].name}`));
      case 'test': return [{ id: 'power', ...POWER, label: 'Switch it on' }];
      case 'fix': {
        const p = PARTS[fault.part];
        if (fault.action === 'scrub') return [partHit(fault.part, `Rub the ${p.name} clean`)];
        if (fault.action === 'swap') return this.swapOut ? [{ id: 'socket', x: p.x, y: p.y, w: p.w, h: p.h, label: 'Seat the new part' }] : [partHit(fault.part, `Pull the old ${p.name} out`)];
        return this.joints
          .map((done, i): Hit | null => {
            if (done) return null;
            const { x, y } = jointAt(p, i, this.joints.length);
            return { id: `joint:${i}`, x: x - 16, y: y - 16, w: 32, h: 32, label: 'Solder this joint', round: true };
          })
          .filter((h): h is Hit => h !== null);
      }
      default: return [];
    }
  }

  /** The tool in hand, drawn by the part it works on while the fix is under way. */
  private inHand(fault: Fault): Html {
    if (this.step !== 'fix') return html``;
    const p = PARTS[fault.part];
    const x = Math.min(VIEW_W - 70, p.x + p.w - 10);
    const y = Math.max(0, p.y - 46);
    return html`<span class="repair__in-hand" style="--x:${pct(x, VIEW_W)};--y:${pct(y, VIEW_H)}" aria-hidden="true">${raw(toolArt(fault.tool))}</span>`;
  }

  private boardParts(fault: Fault): readonly BoardPart[] {
    const platform = this.console?.platform;
    const board = BOARDS[platform === 'gb' ? 'gb' : platform === 'ps1' ? 'ps1' : 'cart']!;
    return board.includes(fault.part) ? board : [...board, fault.part];
  }

  /** The bench seen from above: the board and its parts, the shell over it (with its screws) until lifted. */
  private drawing(console: HomeConsole, fault: Fault): string {
    const spec = CONSOLES[console.platform];
    const parts = this.boardParts(fault);
    const shellOn = this.step === 'unscrew' || this.step === 'lift' || this.step === 'screw' || this.step === 'test' || this.step === 'done';
    const ghost = this.step === 'close';
    const fixing = this.step === 'fix';
    const fixedNow = this.step === 'close' || shellOn && this.step !== 'unscrew' && this.step !== 'lift';
    const svg: string[] = [];
    // The bench mat, the board and its traces.
    svg.push(`<rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="#3c5a4c"/>`);
    svg.push('<rect x="80" y="56" width="480" height="290" rx="8" fill="#2f6b45" stroke="#1f4a30" stroke-width="3"/>');
    for (let i = 0; i < 9; i++) svg.push(`<path d="M${100 + i * 50} 340 V${300 - (i % 3) * 30} H${130 + i * 46}" stroke="#c9a54a" stroke-opacity="0.35" stroke-width="2" fill="none"/>`);
    for (const id of parts) svg.push(this.part(id, id === fault.part, fault, fixing, fixedNow));
    if (fixing && fault.action === 'swap' && this.swapOut) {
      const p = PARTS[fault.part];
      svg.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="#1a1a1a" stroke="#f0d070" stroke-width="2" stroke-dasharray="6 4"/>`);
      svg.push(`<g opacity="0.95" transform="translate(530 330)"><rect x="-44" y="-18" width="88" height="36" rx="4" fill="#d9cfb2"/><text x="0" y="5" font-size="13" text-anchor="middle" fill="#2a2622">NEW PART</text></g>`);
    }
    if (fixing && fault.action === 'solder') {
      const p = PARTS[fault.part];
      this.joints.forEach((done, i) => {
        const { x, y } = jointAt(p, i, this.joints.length);
        svg.push(`<circle cx="${x}" cy="${y}" r="9" fill="${done ? '#e8ecf0' : '#7a6a4a'}" stroke="${done ? '#ffffff' : '#f0d070'}" stroke-width="2"/>`);
      });
    }
    if (shellOn || ghost) {
      const screwsAt = screwPositions(this.screws.length);
      svg.push(`<g class="repair__shell${ghost ? ' repair__shell--ghost' : ''}">`);
      svg.push(`<rect x="${SHELL.x}" y="${SHELL.y}" width="${SHELL.w}" height="${SHELL.h}" rx="14" fill="${spec.shell}" stroke="#00000055" stroke-width="3"/>`);
      svg.push(`<rect x="60" y="250" width="520" height="34" fill="${spec.band}"/>`);
      svg.push(`<text x="320" y="150" font-size="34" text-anchor="middle" fill="#00000044" font-weight="bold">${escapeHtml(getPlatform(console.platform).shortName)}</text>`);
      if (!ghost) {
        const lit = this.step === 'done';
        svg.push(`<g class="repair__power"><rect x="${POWER.x}" y="${POWER.y}" width="${POWER.w}" height="${POWER.h}" rx="6" fill="#2a2a2e"/><text x="131" y="323" font-size="13" text-anchor="middle" fill="#eee">POWER</text></g>`);
        svg.push(`<circle cx="190" cy="318" r="8" fill="${lit ? '#ff3a2a' : '#5a2020'}" ${lit ? 'class="repair__led--on"' : ''}/>`);
        screwsAt.forEach(([x, y], i) => {
          const there = this.screws[i];
          svg.push(`<g class="repair__screw${there ? '' : ' repair__screw--out'}"><circle cx="${x}" cy="${y}" r="13" fill="${there ? '#9aa0a8' : '#00000033'}" stroke="#3a3e44" stroke-width="2"/>${there ? `<path d="M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}" stroke="#3a3e44" stroke-width="3"/>` : ''}</g>`);
        });
      }
      svg.push('</g>');
    }
    return `<svg class="repair__svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="The console on the bench">${svg.join('')}</svg>`;
  }

  /** One part of the board: drawn healthy, or as the fault shows on it (until mended). */
  private part(id: BoardPart, faulty: boolean, fault: Fault, fixing: boolean, fixedNow: boolean): string {
    const p = PARTS[id];
    const bad = faulty && !fixedNow;
    if (faulty && fixing && fault.action === 'swap' && this.swapOut) return '';
    const grime = (opacity: number) => `<rect data-grime x="${p.x - 4}" y="${p.y - 4}" width="${p.w + 8}" height="${p.h + 8}" rx="6" fill="#8a9a6a" opacity="${opacity}"/>`;
    const scrubbed = fixing && fault.action === 'scrub' ? 0.85 * (1 - this.scrub) : 0.85;
    switch (id) {
      case 'connector': {
        const pins = Array.from({ length: 24 }, (_, i) => {
          const x = p.x + 8 + i * ((p.w - 16) / 23);
          const bent = bad && fault.part === 'connector' && fault.action === 'swap' && i % 3 === 1;
          return `<rect x="${x}" y="${p.y + 8 + (bent ? 6 : 0)}" width="4" height="${p.h - 16}" fill="${bad && fault.action === 'swap' ? '#4a4030' : '#d8b04a'}" ${bent ? `transform="rotate(18 ${x} ${p.y + 22})"` : ''}/>`;
        }).join('');
        return `<g class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="#1c1c1c"/>${pins}${bad && fault.action === 'scrub' ? grime(scrubbed) : ''}</g>`;
      }
      case 'cpu':
        return `<g class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="#141414"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 5}" font-size="14" text-anchor="middle" fill="#aaa">CPU</text></g>`;
      case 'regulator':
        return `<g class="repair__part"><rect x="${p.x}" y="${p.y + 14}" width="${p.w}" height="${p.h - 14}" fill="#2e2e30"/><rect x="${p.x + 4}" y="${p.y}" width="${p.w - 8}" height="18" fill="#9aa0a8"/></g>`;
      case 'capacitor': {
        const caps = [0, 1, 2].map((i) => {
          const cx = p.x + 20 + i * 40;
          const cy = p.y + p.h / 2;
          // The bad one (the middle) until it is out; then the new one stands in its place.
          const leak = bad && i === 1 && !(fixing && this.solderStage === 'in');
          return `<circle cx="${cx}" cy="${cy}" r="16" fill="${leak ? '#7a5a2a' : '#2a3f8f'}" stroke="${leak ? '#c8b07a' : '#9ab0e0'}" stroke-width="${leak ? 4 : 2}"/>${leak ? `<circle cx="${cx}" cy="${cy}" r="7" fill="#d8c890"/>` : `<path d="M${cx - 8} ${cy} H${cx + 8}" stroke="#9ab0e0" stroke-width="2"/>`}`;
        }).join('');
        return `<g class="repair__part">${caps}</g>`;
      }
      case 'fuse':
        return `<g class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${bad ? '#5a4a3a' : '#cfe3ea'}" stroke="#9aa0a8" stroke-width="3"/><path d="M${p.x + 8} ${p.y + p.h / 2} H${p.x + p.w - 8}" stroke="${bad ? '#2a2018' : '#888'}" stroke-width="2"/></g>`;
      case 'battery':
        return `<g class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="#3a3a3e"/><path d="M${p.x + 14} ${p.y + 20} l10 8 l-10 8 l10 8 l-10 8" stroke="#c8c8c8" stroke-width="3" fill="none"/><path d="M${p.x + 50} ${p.y + 70} l10 8 l-10 8 l10 8" stroke="#c8c8c8" stroke-width="3" fill="none"/>${bad ? grime(scrubbed).replace('#8a9a6a', '#e8eedc') : ''}</g>`;
      case 'lens':
        return `<g class="repair__part"><circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="${p.w / 2}" fill="#2a2a2e"/><circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="11" fill="#7ab0c8"/>${bad ? `<circle data-grime cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="14" fill="#b8b0a0" opacity="${scrubbed}"/>` : ''}</g>`;
      case 'ribbon': {
        const loose = bad;
        return `<g class="repair__part"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#d68a2a"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${p.x + 10 + i * 19} ${p.y + 2} V${p.y + p.h - 2}" stroke="${loose && i % 4 === 2 ? '#5a3010' : '#f0c070'}" stroke-width="2"/>`).join('')}</g>`;
      }
    }
  }
}

/** `value` of `of` as a CSS percentage. */
function pct(value: number, of: number): string {
  return `${((value / of) * 100).toFixed(2)}%`;
}

/** Joint `i` of `count` under a part. */
function jointAt(p: { x: number; y: number; w: number; h: number }, i: number, count: number): { x: number; y: number } {
  return { x: p.x + ((i + 0.5) / count) * p.w, y: p.y + p.h + 8 };
}

/** The shell's screws: its corners first, then midway along the long sides. */
function screwPositions(count: number): [number, number][] {
  const all: [number, number][] = [[92, 66], [548, 66], [92, 336], [548, 336], [320, 60], [320, 342]];
  return all.slice(0, count);
}

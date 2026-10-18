import { type ArcadeControls, NO_CONTROLS, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';
import { random } from '@/random';
import { arcadeHint } from '../arcadeHint';
import { Sprite } from './sprite';

const ROUND_SECONDS = 20;
const LANES = ['left', 'down', 'up', 'right'] as const;
type Lane = (typeof LANES)[number];
const LANE_W = 40;
const LANES_X = (SCREEN_W - LANES.length * LANE_W) / 2;
/** The receptors, near the top: the arrows rise to them. */
const TARGET_Y = PLAY_TOP + 26;
const ARROW = 14;
/** How far ahead of its beat an arrow shows (seconds of travel from the bottom). */
const LEAD = 1.6;
/** Judgement windows, seconds either side of the beat, and what each pays. */
const WINDOWS: { within: number; label: string; points: number; color: string }[] = [
  { within: 0.05, label: 'MARVELOUS', points: 30, color: '#ffffff' },
  { within: 0.1, label: 'GREAT', points: 20, color: '#7ee787' },
  { within: 0.16, label: 'GOOD', points: 10, color: '#ffe066' },
];
/**
 * How late a step lands after the arrow is seen on the receptor: the frame, the cabinet's glass in the 3D view, the
 * screen and the key all lag. Steps are judged against the song this much ago, or a player on time reads as late.
 */
const INPUT_LAG = 0.06;
const MISS_SECONDS = 0.6;
/** A step this soon after its arrow went by late is that arrow's step, already counted as missed: not a second miss. */
const LATE_GRACE = 0.2;
/** Clean steps in a row that light the FEVER (double points for a while, and seconds). */
const FEVER_AFTER = 16;
const FEVER_SECONDS = 4;
const FEVER_BONUS_TIME = 2;
/** Steps hit per stage; a stage speeds the song up and pays seconds. */
const STEPS_PER_STAGE = 20;
const STAGE_SECONDS = 2;
const START_BPM = 118;
const BPM_PER_STAGE = 8;
const MAX_BPM = 176;
const LANE_COLORS: Record<Lane, string> = { left: '#ff7ad9', down: '#63b3ff', up: '#7ee787', right: '#ffb347' };
/** Holds from this stage on: an arrow with a tail, the panel kept down to its end; each eighth held pays this. */
const HOLDS_FROM = 3;
const HOLD_POINTS = 15;
/** Let go this long before a hold's end and it is dropped. */
const HOLD_SLACK = 0.06;
/** The bass line: semitones over the root on the bar's eighths (null: rest), and the root of each bar in turn. */
const BASS_STEPS: readonly (number | null)[] = [0, null, 0, 12, null, 0, 7, null];
const BASS_ROOTS = [0, 0, -4, -2];

/** An arrow pointing up, 14 px; the others are it turned. */
const ARROW_UP = ['......xx......', '.....xxxx.....', '....xxooxx....', '...xxooooxx...', '..xxooooooxx..', '.xxooooooooxx.', 'xxxxxooooxxxxx', '....xooooxx...', '....xooooxx...', '....xooooxx...', '....xooooxx...', '....xooooxx...', '....xxxxxxx...', '..............'];
function turn(rows: readonly string[]): string[] {
  const size = rows.length;
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => rows[size - 1 - x]?.[y] ?? '.').join(''));
}
const ARROW_RIGHT = turn(ARROW_UP);
const ARROW_DOWN = turn(ARROW_RIGHT);
const ARROWS: Record<Lane, Sprite> = { up: new Sprite([ARROW_UP]), right: new Sprite([ARROW_RIGHT]), down: new Sprite([ARROW_DOWN]), left: new Sprite([turn(ARROW_DOWN)]) };

interface Note {
  lanes: Lane[];
  /** Song time of its beat, seconds. */
  at: number;
  /** Lanes of it already stepped on (a jump needs both). */
  hit: Lane[];
  /** A hold: the song time its tail ends. */
  until?: number;
}

/** A hold being kept down: its lane, its end, how many eighths it pays. */
interface Holding {
  lane: Lane;
  until: number;
  eighths: number;
}

/**
 * STEP BEAT: the dance cabinet. Arrows rise up four lanes on the beat of a drum machine (kick,
 * snare, hats and a bass line) and have to be stepped on (the pad's panels, or WASD / arrows) as
 * they reach the receptors: MARVELOUS, GREAT or GOOD by how close to the beat, chaining the combo;
 * a late arrow costs a little time, a step on nothing only the combo. From the second stage on, some beats are
 * jumps (two panels at once); from the third, some arrows trail a tail to keep the panel down to its
 * end (paid per eighth held; let go early and it is dropped). Sixteen clean steps in a row light the
 * FEVER: double points for a few seconds and two more on the clock. Every twenty steps is a stage:
 * the song speeds up and two seconds come back. The charts are drawn from the run's seed, so a run
 * replays exactly.
 */
export class StepBeat extends BaseGame {
  readonly id = 'stepbeat';
  readonly title = 'STEP BEAT';
  get hint(): string {
    return arcadeHint('Step on the pad ({stick} or arrows) as each arrow reaches the top');
  }
  readonly summary = '20 SEC · STEP ON THE BEAT · JUMPS · FEVER x2';

  private notes: Note[] = [];
  private songTime = 0;
  /** Song time of the next eighth-note slot to chart, and its index (for the drum pattern). */
  private nextSlot = 0;
  private slot = 0;
  private beatsPlayed = 0;
  /** The charted eighths still to sound, by song time and slot (the drums follow the chart, whatever the tempo does). */
  private beats: { at: number; slot: number }[] = [];
  private holding: Holding[] = [];
  private steps = 0;
  private clean = 0;
  private fever = 0;
  private bpm = START_BPM;
  private lastLane: Lane | null = null;
  private flashLane: Partial<Record<Lane, number>> = {};
  /** Song time each lane last let an arrow go by without a step. */
  private missedAt: Partial<Record<Lane, number>> = {};
  private beatPulse = 0;

  constructor() {
    super(ROUND_SECONDS);
  }

  /** Which panels are lit on the pad this frame: the ones stepped on, and all four on the beat during FEVER. */
  panelGlow(lane: Lane): number {
    const flash = (this.flashLane[lane] ?? 0) > 0 ? 1 : 0;
    return Math.max(flash, this.fever > 0 ? this.beatPulse : this.beatPulse * 0.25);
  }

  protected begin(): void {
    this.notes = [];
    this.songTime = 0;
    this.nextSlot = 0.4;
    this.slot = 0;
    this.beatsPlayed = 0;
    this.beats = [];
    this.holding = [];
    this.pilotPlans.clear();
    this.pilotLetsGo.clear();
    this.steps = 0;
    this.clean = 0;
    this.fever = 0;
    this.bpm = START_BPM;
    this.lastLane = null;
    this.flashLane = {};
    this.missedAt = {};
    this.beatPulse = 0;
  }

  /** The song time a step taken now is judged at (`INPUT_LAG`). */
  private get heard(): number {
    return this.songTime - INPUT_LAG;
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    this.songTime += dt;
    this.fever = Math.max(0, this.fever - dt);
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    for (const lane of LANES) this.flashLane[lane] = Math.max(0, (this.flashLane[lane] ?? 0) - dt);

    // The drums, on the beat the notes are charted to (they lead the arrows by `LEAD`).
    while (this.nextSlot <= this.songTime + LEAD) this.chart(this.nextSlot, 30 / this.bpm);
    while (this.beats.length && this.beats[0]!.at <= this.songTime) {
      const { slot } = this.beats.shift()!;
      this.playSlot(slot);
    }
    this.updateHolds(controls);

    // Late notes: every lane not stepped on is a miss (once per note).
    const heard = this.heard;
    const late = this.notes.filter((n) => heard - n.at > WINDOWS[WINDOWS.length - 1]!.within);
    if (late.length) {
      this.notes = this.notes.filter((n) => !late.includes(n));
      for (const n of late) {
        if (n.hit.length >= n.lanes.length) continue;
        for (const l of n.lanes) if (!n.hit.includes(l)) this.missedAt[l] = this.songTime;
        this.miss(n.lanes.find((l) => !n.hit.includes(l)) ?? n.lanes[0]!, MISS_SECONDS);
      }
    }

    for (const lane of LANES) {
      if (!this.keys.pressed(controls, lane)) continue;
      this.flashLane[lane] = 0.12;
      let nearest: Note | null = null;
      for (const n of this.notes) if (n.lanes.includes(lane) && !n.hit.includes(lane) && (!nearest || Math.abs(n.at - heard) < Math.abs(nearest.at - heard))) nearest = n;
      const off = nearest ? Math.abs(nearest.at - heard) : Infinity;
      const judged = WINDOWS.find((w) => off <= w.within);
      if (!nearest || !judged) {
        // A step on nothing breaks the chain (mashing never pays), but costs no seconds; just after a missed arrow it is that arrow's.
        if (this.songTime - (this.missedAt[lane] ?? -Infinity) > LATE_GRACE) this.miss(lane, 0);
        continue;
      }
      nearest.hit.push(lane);
      if (nearest.hit.length < nearest.lanes.length) continue; // half a jump: wait for the other foot
      this.notes = this.notes.filter((n) => n !== nearest);
      this.stepped(judged, nearest.lanes);
      if (nearest.until !== undefined) this.holding.push({ lane, until: nearest.until, eighths: Math.round((nearest.until - nearest.at) / (30 / this.bpm)) });
    }
  }

  /** One charted eighth sounding: kick and snare on the beats, hats between, the bass line on its steps. */
  private playSlot(slot: number): void {
    if (slot % 2 === 0) {
      this.beatPulse = 1;
      this.sound(this.beatsPlayed % 2 === 0 ? 'kick' : 'snare');
      this.beatsPlayed += 1;
    } else this.sound('hat');
    const step = BASS_STEPS[slot % BASS_STEPS.length];
    if (step !== null && step !== undefined) {
      const root = BASS_ROOTS[Math.floor(slot / BASS_STEPS.length) % BASS_ROOTS.length]!;
      this.sound('bass', Math.pow(2, (root + step) / 12));
    }
  }

  /** Holds being kept down: paid at their end, dropped when the panel comes up early. */
  private updateHolds(controls: ArcadeControls): void {
    this.holding = this.holding.filter((h) => {
      const x = this.laneX(h.lane) + LANE_W / 2;
      if (this.songTime >= h.until) {
        this.addScore(HOLD_POINTS * Math.max(1, h.eighths) * (this.fever > 0 ? 2 : 1), x, TARGET_Y + 28, '#9ad6ff');
        this.fx.pop('HELD!', x, TARGET_Y + 44, '#9ad6ff', 7);
        this.sound('perfect', 1.2);
        return false;
      }
      if (!controls[h.lane] && this.songTime < h.until - HOLD_SLACK) {
        this.clean = 0;
        this.breakCombo();
        this.fx.pop('DROPPED', x, TARGET_Y + 44, '#ff8a80', 7);
        this.sound('miss');
        return false;
      }
      this.flashLane[h.lane] = 0.05;
      return true;
    });
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.fever > 0 ? '#1a0826' : '#080a1a';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // A floor of light pulsing with the beat behind the lanes.
    ctx.fillStyle = `rgba(${this.fever > 0 ? '255,47,160' : '99,179,255'},${0.05 + this.beatPulse * 0.08})`;
    for (let y = PLAY_TOP + 8; y < SCREEN_H; y += 16) ctx.fillRect(0, y, SCREEN_W, 1);
    for (const lane of LANES) {
      const x = this.laneX(lane);
      ctx.fillStyle = (this.flashLane[lane] ?? 0) > 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.035)';
      ctx.fillRect(x + 1, PLAY_TOP, LANE_W - 2, SCREEN_H - PLAY_TOP);
      const pulse = 1 + this.beatPulse * 0.15;
      ctx.strokeStyle = LANE_COLORS[lane];
      ctx.lineWidth = 2;
      const s = (ARROW + 8) * pulse;
      ctx.strokeRect(x + LANE_W / 2 - s / 2, TARGET_Y - s / 2, s, s);
      ARROWS[lane].drawCentred(ctx, x + LANE_W / 2, TARGET_Y, { x: 'rgba(255,255,255,0.45)', o: 'rgba(255,255,255,0.08)' });
    }
    const speed = (SCREEN_H - TARGET_Y) / LEAD;
    // Holds being kept: their tail shrinking into the receptor.
    for (const h of this.holding) {
      const x = this.laneX(h.lane) + LANE_W / 2;
      const tail = TARGET_Y + (h.until - this.songTime) * speed;
      ctx.fillStyle = LANE_COLORS[h.lane];
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x - 4, TARGET_Y, 8, Math.max(0, tail - TARGET_Y));
      ctx.globalAlpha = 1;
    }
    this.drawStage(ctx, this.fever > 0 ? 'FEVER x2' : `STAGE ${this.stage} · ${Math.round(this.bpm)} BPM`);
    for (const n of this.notes) {
      const y = TARGET_Y + (n.at - this.songTime) * speed;
      if (y > SCREEN_H + ARROW) continue;
      if (n.lanes.length > 1) {
        // A jump: the two arrows joined by a bar.
        const xs = n.lanes.map((l) => this.laneX(l) + LANE_W / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(Math.min(...xs), y - 1, Math.abs(xs[1]! - xs[0]!), 2);
      }
      for (const lane of n.lanes) {
        if (n.hit.includes(lane)) continue;
        const x = this.laneX(lane) + LANE_W / 2;
        if (n.until !== undefined) {
          // The tail to keep the panel down along.
          const tail = TARGET_Y + (n.until - this.songTime) * speed;
          ctx.fillStyle = LANE_COLORS[lane];
          ctx.globalAlpha = 0.4;
          ctx.fillRect(x - 4, y, 8, Math.max(0, tail - y));
          ctx.globalAlpha = 1;
        }
        ARROWS[lane].drawCentred(ctx, x, y, { x: '#ffffff', o: LANE_COLORS[lane] });
      }
    }
    if (this.clean >= 8 && this.fever <= 0) drawText(ctx, `${this.clean} CLEAN`, SCREEN_W - 8, SCREEN_H - 10, 7, 'rgba(255,255,255,0.55)', 'right');
  }

  /**
   * Steps on each arrow as it reaches the receptor: whether and how far off the beat is decided once per arrow (a lesser
   * dancer misses more and drifts further), and a hold is kept down to its end (a lesser one now and then lets go).
   */
  autopilot(skill: number): ArcadeControls {
    const out = { ...NO_CONTROLS };
    for (const h of this.holding) if (!this.pilotLetsGo.has(h.until)) out[h.lane] = true;
    for (const lane of LANES) {
      if (out[lane]) continue;
      if (this.keys.isHeld(lane)) continue;
      const note = this.notes.find((n) => n.lanes.includes(lane) && !n.hit.includes(lane) && Math.abs(n.at - this.heard) < 0.2);
      if (!note) continue;
      const key = `${note.at}:${lane}`;
      let plan = this.pilotPlans.get(key);
      if (!plan) {
        plan = { steps: random() < 0.72 + skill * 0.26, off: (random() - 0.5) * 2 * (0.015 + (1 - skill) * 0.1) };
        this.pilotPlans.set(key, plan);
        if (note.until !== undefined && random() < (1 - skill) * 0.4) this.pilotLetsGo.add(note.until);
        if (this.pilotPlans.size > 64) this.pilotPlans.delete(this.pilotPlans.keys().next().value!);
      }
      if (plan.steps && this.heard >= note.at + plan.off) out[lane] = true;
    }
    return out;
  }

  private readonly pilotPlans = new Map<string, { steps: boolean; off: number }>();
  private readonly pilotLetsGo = new Set<number>();

  private get stage(): number {
    return Math.floor(this.steps / STEPS_PER_STAGE) + 1;
  }

  /** Charts the eighth-note slot at `at`: an arrow on most beats, fewer on the offbeats, jumps from stage two, holds from three. */
  private chart(at: number, eighth: number): void {
    const onBeat = this.slot % 2 === 0;
    this.beats.push({ at, slot: this.slot });
    // A hold still running in a lane keeps arrows off it.
    const held = this.notes.filter((n) => n.until !== undefined && n.until > at - eighth).flatMap((n) => n.lanes);
    const density = Math.min(0.85, 0.35 + (this.stage - 1) * 0.1);
    const roll = this.rand();
    if (onBeat ? roll < 0.8 : roll < density * 0.45) {
      let lane = LANES[Math.floor(this.rand() * LANES.length)]!;
      if (lane === this.lastLane) lane = LANES[(LANES.indexOf(lane) + 1 + Math.floor(this.rand() * 3)) % LANES.length]!;
      if (held.includes(lane)) lane = LANES.find((l) => !held.includes(l) && l !== this.lastLane) ?? lane;
      this.lastLane = lane;
      const lanes: Lane[] = [lane];
      const jump = onBeat && this.stage >= 2 && this.rand() < 0.12 + this.stage * 0.03;
      if (jump) {
        const options = LANES.filter((l) => l !== lane && !held.includes(l));
        const other = options[Math.floor(this.rand() * options.length)];
        if (other) lanes.push(other);
      }
      const hold = !jump && onBeat && this.stage >= HOLDS_FROM && this.rand() < 0.18;
      if (!held.includes(lane)) this.notes.push({ lanes, at, hit: [], ...(hold ? { until: at + eighth * (2 + Math.floor(this.rand() * 3)) } : {}) });
    }
    this.nextSlot = at + eighth;
    this.slot += 1;
  }

  private stepped(judged: (typeof WINDOWS)[number], lanes: Lane[]): void {
    const x = lanes.reduce((sum, l) => sum + this.laneX(l) + LANE_W / 2, 0) / lanes.length;
    this.bumpCombo(Infinity);
    const points = judged.points * lanes.length * (this.fever > 0 ? 2 : 1);
    this.addScore(points, x, TARGET_Y + 28, judged.color);
    this.fx.pop(judged.label, x, TARGET_Y + 44, judged.color, 7);
    this.sound(judged === WINDOWS[0] ? 'perfect' : 'good', judged === WINDOWS[2] ? 0.85 : 1);
    this.steps += 1;
    this.clean += 1;
    if (this.clean % FEVER_AFTER === 0) {
      this.fever = FEVER_SECONDS;
      this.fx.flash('#ff2fa0', 0.12);
      this.fx.pop('FEVER!', SCREEN_W / 2, SCREEN_H / 2, '#ff2fa0', 14);
      this.addTime(FEVER_BONUS_TIME, SCREEN_W / 2, SCREEN_H / 2 + 20);
    }
    if (this.steps % STEPS_PER_STAGE === 0) {
      this.bpm = Math.min(MAX_BPM, this.bpm + BPM_PER_STAGE);
      this.fx.pop(`STAGE ${this.stage}`, SCREEN_W / 2, SCREEN_H / 2 - 24, '#ffffff', 12);
      this.addTime(STAGE_SECONDS, SCREEN_W / 2, SCREEN_H / 2);
    }
  }

  private laneX(lane: Lane): number {
    return LANES_X + LANES.indexOf(lane) * LANE_W;
  }

  private miss(lane: Lane, seconds: number): void {
    this.clean = 0;
    this.breakCombo();
    this.fx.pop('MISS', this.laneX(lane) + LANE_W / 2, TARGET_Y + 28, '#ff5f5f', 8);
    this.sound('miss');
    if (seconds > 0) {
      this.addTime(-seconds, this.laneX(lane) + LANE_W / 2, TARGET_Y + 44);
      this.fx.shake(1.5, 0.1);
    }
  }
}

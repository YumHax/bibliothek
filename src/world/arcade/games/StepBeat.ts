import { type ArcadeControls, NO_CONTROLS, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

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
  { within: 0.045, label: 'MARVELOUS', points: 30, color: '#ffffff' },
  { within: 0.09, label: 'GREAT', points: 20, color: '#7ee787' },
  { within: 0.14, label: 'GOOD', points: 10, color: '#ffe066' },
];
const MISS_SECONDS = 1;
/** Clean steps in a row that light the FEVER (double points for a while, and seconds). */
const FEVER_AFTER = 24;
const FEVER_SECONDS = 4;
const FEVER_BONUS_TIME = 2;
/** Steps hit per stage; a stage speeds the song up and pays seconds. */
const STEPS_PER_STAGE = 20;
const STAGE_SECONDS = 2;
const START_BPM = 118;
const BPM_PER_STAGE = 8;
const MAX_BPM = 176;
const LANE_COLORS: Record<Lane, string> = { left: '#ff7ad9', down: '#63b3ff', up: '#7ee787', right: '#ffb347' };
const GLYPH: Record<Lane, string> = { left: '<', down: 'v', up: '^', right: '>' };

interface Note {
  lanes: Lane[];
  /** Song time of its beat, seconds. */
  at: number;
  /** Lanes of it already stepped on (a jump needs both). */
  hit: Lane[];
}

/**
 * STEP BEAT: the dance cabinet. Arrows rise up four lanes on the beat of a drum machine and have
 * to be stepped on (the pad's panels, or WASD / arrows) as they reach the receptors: MARVELOUS,
 * GREAT or GOOD by how close to the beat, chaining the combo; a late arrow or a step on nothing
 * costs a second. From the second stage on, some beats are jumps (two panels at once). Twenty-four
 * clean steps in a row light the FEVER: double points for a few seconds and two more on the
 * clock. Every twenty steps is a stage: the song speeds up and two seconds come back. The charts
 * are drawn from the run's seed, so a run replays exactly.
 */
export class StepBeat extends BaseGame {
  readonly id = 'stepbeat';
  readonly title = 'STEP BEAT';
  readonly hint = 'Step on the pad (WASD or arrows) as each arrow reaches the top';
  readonly summary = '20 SEC · STEP ON THE BEAT · JUMPS · FEVER x2';

  private notes: Note[] = [];
  private songTime = 0;
  /** Song time of the next eighth-note slot to chart, and its index (for the drum pattern). */
  private nextSlot = 0;
  private slot = 0;
  private beatsPlayed = 0;
  /** Song times of the charted beats still to sound (the drums follow the chart, whatever the tempo does). */
  private beats: number[] = [];
  private steps = 0;
  private clean = 0;
  private fever = 0;
  private bpm = START_BPM;
  private lastLane: Lane | null = null;
  private flashLane: Partial<Record<Lane, number>> = {};
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
    this.steps = 0;
    this.clean = 0;
    this.fever = 0;
    this.bpm = START_BPM;
    this.lastLane = null;
    this.flashLane = {};
    this.beatPulse = 0;
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    this.songTime += dt;
    this.fever = Math.max(0, this.fever - dt);
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    for (const lane of LANES) this.flashLane[lane] = Math.max(0, (this.flashLane[lane] ?? 0) - dt);

    // The drums, on the beat the notes are charted to (they lead the arrows by `LEAD`).
    while (this.nextSlot <= this.songTime + LEAD) this.chart(this.nextSlot, 30 / this.bpm);
    while (this.beats.length && this.beats[0]! <= this.songTime) {
      this.beats.shift();
      this.beatPulse = 1;
      this.sound(this.beatsPlayed % 2 === 0 ? 'kick' : 'snare');
      this.beatsPlayed += 1;
    }

    // Late notes: every lane not stepped on is a miss (once per note).
    const late = this.notes.filter((n) => this.songTime - n.at > WINDOWS[WINDOWS.length - 1]!.within);
    if (late.length) {
      this.notes = this.notes.filter((n) => !late.includes(n));
      for (const n of late) if (n.hit.length < n.lanes.length) this.miss(n.lanes.find((l) => !n.hit.includes(l)) ?? n.lanes[0]!);
    }

    for (const lane of LANES) {
      if (!this.keys.pressed(controls, lane)) continue;
      this.flashLane[lane] = 0.12;
      let nearest: Note | null = null;
      for (const n of this.notes) if (n.lanes.includes(lane) && !n.hit.includes(lane) && (!nearest || Math.abs(n.at - this.songTime) < Math.abs(nearest.at - this.songTime))) nearest = n;
      const off = nearest ? Math.abs(nearest.at - this.songTime) : Infinity;
      const judged = WINDOWS.find((w) => off <= w.within);
      if (!nearest || !judged) {
        this.miss(lane);
        continue;
      }
      nearest.hit.push(lane);
      if (nearest.hit.length < nearest.lanes.length) continue; // half a jump: wait for the other foot
      this.notes = this.notes.filter((n) => n !== nearest);
      this.stepped(judged, nearest.lanes);
    }
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
      drawText(ctx, GLYPH[lane], x + LANE_W / 2, TARGET_Y + 1, 12, 'rgba(255,255,255,0.4)');
    }
    this.drawStage(ctx, this.fever > 0 ? 'FEVER x2' : `STAGE ${this.stage} · ${Math.round(this.bpm)} BPM`);
    const speed = (SCREEN_H - TARGET_Y) / LEAD;
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
        ctx.fillStyle = LANE_COLORS[lane];
        ctx.fillRect(x - ARROW / 2 - 3, y - ARROW / 2 - 3, ARROW + 6, ARROW + 6);
        drawText(ctx, GLYPH[lane], x, y + 1, 12, '#080a1a');
      }
    }
    if (this.clean >= 8 && this.fever <= 0) drawText(ctx, `${this.clean} CLEAN`, SCREEN_W - 8, SCREEN_H - 10, 7, 'rgba(255,255,255,0.55)', 'right');
  }

  /** Steps on each arrow as it reaches the receptor (a lesser dancer a little off the beat, now and then not at all). */
  autopilot(skill: number): ArcadeControls {
    const out = { ...NO_CONTROLS };
    for (const lane of LANES) {
      if (this.keys.isHeld(lane)) continue;
      const note = this.notes.find((n) => n.lanes.includes(lane) && !n.hit.includes(lane) && Math.abs(n.at - this.songTime) < 0.1);
      if (!note) continue;
      const off = this.songTime - note.at;
      if (off >= -(1 - skill) * 0.08 && Math.random() < 0.4 + skill * 0.5) out[lane] = true;
    }
    return out;
  }

  private get stage(): number {
    return Math.floor(this.steps / STEPS_PER_STAGE) + 1;
  }

  /** Charts the eighth-note slot at `at`: an arrow on most beats, fewer on the offbeats, jumps from stage two. */
  private chart(at: number, eighth: number): void {
    const onBeat = this.slot % 2 === 0;
    if (onBeat) this.beats.push(at);
    const density = Math.min(0.85, 0.35 + (this.stage - 1) * 0.1);
    const roll = this.rand();
    if (onBeat ? roll < 0.8 : roll < density * 0.45) {
      let lane = LANES[Math.floor(this.rand() * LANES.length)]!;
      if (lane === this.lastLane) lane = LANES[(LANES.indexOf(lane) + 1 + Math.floor(this.rand() * 3)) % LANES.length]!;
      this.lastLane = lane;
      const lanes: Lane[] = [lane];
      if (onBeat && this.stage >= 2 && this.rand() < 0.12 + this.stage * 0.03) {
        const other = LANES.filter((l) => l !== lane)[Math.floor(this.rand() * 3)]!;
        lanes.push(other);
      }
      this.notes.push({ lanes, at, hit: [] });
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

  private miss(lane: Lane): void {
    this.clean = 0;
    this.breakCombo();
    this.fx.pop('MISS', this.laneX(lane) + LANE_W / 2, TARGET_Y + 28, '#ff5f5f', 8);
    this.addTime(-MISS_SECONDS, this.laneX(lane) + LANE_W / 2, TARGET_Y + 44);
    this.fx.shake(1.5, 0.1);
  }
}

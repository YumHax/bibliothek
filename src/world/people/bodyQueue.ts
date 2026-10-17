import type * as THREE from 'three';

/*
 * People's bodies built over the browser's idle moments, a part at a time (`rig.rigSteps`): a person is about sixty
 * milliseconds of geometry and painted canvases, and a street or a crowd is dozens of them. Built where they were
 * made (in a zone's build, ahead of time), they froze the stairs for seconds while Front Street got ready below.
 * Each idle moment runs the next step of the nearest waiting body (an owner tells how far it is: `priority`), then
 * more while the moment lasts; a body's programs are then linked before it shows (`setBodyCompiler`).
 */

/** A body being built: `step` runs its next part and says whether it is done; the smaller `priority` goes first. */
export interface BodyJob {
  step(): boolean;
  /** Metres from the eye (Infinity until its owner knows): the nearest is built first. */
  priority: number;
}

/** Idle time (ms) left in a moment for another step to start in it (a step is a few milliseconds). */
const STEP_ROOM_MS = 4;
/**
 * Milliseconds of steps a moment at most, however idle the browser says it is (up to 50 ms when the scene is calm:
 * a frame waiting on that is a hitch), and what a moment the browser forced (none idle for `FORCE_AFTER_MS`) gets.
 */
const SLICE_MS = 6;
const FORCE_AFTER_MS = 250;

const jobs: BodyJob[] = [];
let scheduled = false;
let compiler: ((root: THREE.Object3D) => Promise<void>) | null = null;

/** Whether bodies are built over idle moments here (a browser with `requestIdleCallback`); elsewhere (Node's checks, Safari) at once, as made. */
export function deferBodies(): boolean {
  return typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';
}

/** Queues a body to be built; it is dropped from the queue once its last step has run. */
export function queueBody(job: BodyJob): void {
  jobs.push(job);
  schedule();
}

/** Links a finished body's shader programs before it is shown (`renderer.compileAsync`, wired at start-up); none: shown at once. */
export function setBodyCompiler(compile: (root: THREE.Object3D) => Promise<void>): void {
  compiler = compile;
}

/** The last body's compile: they go one after another (each polls its own materials until linked; a crowd's at once polled them all every few ms). */
let compiling: Promise<void> = Promise.resolve();

/** A finished body's programs linked (`setBodyCompiler`), after the bodies before it; at once when nothing is wired. */
export function compileBody(root: THREE.Object3D): Promise<void> {
  const compile = compiler;
  if (!compile) return Promise.resolve();
  compiling = compiling.then(() => compile(root).catch(() => undefined));
  return compiling;
}

function schedule(): void {
  if (scheduled || jobs.length === 0) return;
  scheduled = true;
  window.requestIdleCallback(run, { timeout: FORCE_AFTER_MS });
}

function run(deadline: IdleDeadline): void {
  scheduled = false;
  const started = performance.now(); // convention-ok: a CPU budget for the steps, not an animation
  // At least one step a moment; more while the slice lasts and the moment has room.
  do {
    const job = nearest();
    if (!job) break;
    if (job.step()) jobs.splice(jobs.indexOf(job), 1);
  } while (jobs.length > 0 && performance.now() - started < SLICE_MS && (deadline.didTimeout || deadline.timeRemaining() > STEP_ROOM_MS)); // convention-ok: the same budget
  schedule();
}

/** The waiting body nearest the eye (the first queued among equals). */
function nearest(): BodyJob | undefined {
  let best: BodyJob | undefined;
  for (const job of jobs) if (!best || job.priority < best.priority) best = job;
  return best;
}

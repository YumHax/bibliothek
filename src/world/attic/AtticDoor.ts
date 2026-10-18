import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { playKnock } from '@/audio/doorbell';
import { invisibleHitbox } from '../meshUtils';
import { HoverGlint } from '../props/hoverGlint';
import { ShutDoor } from '../props/ShutDoor';
import type { AtticDoorPlan } from './atticPlan';
import { nudge, tier } from '@/social/standing';
import { atLeast } from '@/social/tiers';

/** Théo, the student behind No 6 (`social/people/building`). */
const STUDENT = 'student';
/** A listen to his mix through the door, once a game day. */
const LISTEN_WARMTH = 2;

/** The maids' rooms' doors: narrow, brown, their numbers in white enamel. */
const LEAF = { width: 0.72, height: 1.95, color: 0x5a4632 };

/**
 * A maid's room door on the attic's corridor: a narrow painted door with its enamel number, knocked
 * on for a line (in turn); the student's answers back, and his music plays behind it (the builder
 * puts the sound there). Wall-hung like every `ShutDoor`: origin on the floor at its middle, +z into the corridor.
 */
export class AtticDoor extends ShutDoor implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;
  private knocks = 0;

  constructor(private readonly plan: AtticDoorPlan) {
    super({ style: 'panelled', width: LEAF.width, height: LEAF.height, leafColor: LEAF.color, mat: false });
    this.name = `AtticDoor:${plan.n}`;
    const hitbox = invisibleHitbox(LEAF.width + 0.12, LEAF.height + 0.07, 0.1, { y: (LEAF.height + 0.07) / 2, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.leafFace.add(numberPlate(plan.n));
    this.glint = HoverGlint.fittings(this.leafFace);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return `No ${this.plan.n}${this.plan.who ? `, ${this.plan.who}` : ''} · knock`;
  }

  activate(session: SessionActions): void {
    playKnock(3, 0.3);
    // Théo next door a friend: he answers for the rooms either side of his, and opens his own for a listen.
    const friendly = this.plan.friendKnock && atLeast(tier(STUDENT), 'friend');
    const lines = friendly ? this.plan.friendKnock! : this.plan.knock;
    session.react(lines[this.knocks++ % lines.length]!);
    if (friendly && this.plan.music) nudge(STUDENT, { warmth: LISTEN_WARMTH, day: this.day(), why: 'you listened to my mix', reason: 'listen' });
  }

  /** The game day, for a listen counted once a day (set by the builder). */
  day: () => number = () => 0;
}

/** The room's number on a white enamel oval, high on the leaf. */
function numberPlate(n: number): THREE.Mesh {
  const [canvas, ctx] = createCanvas(128, 96);
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#f2efe6';
  ctx.beginPath();
  ctx.ellipse(64, 48, 58, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e2a4a';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#1e2a4a';
  ctx.font = 'bold 56px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 52);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.075), new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), roughness: 0.3, transparent: true }));
  // On the leaf's face (16 mm), clear of the raised panels' 2 mm.
  plate.position.set(0, 1.6, 0.016 + 0.003);
  plate.castShadow = false;
  return plate;
}

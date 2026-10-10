import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { KettleWhistle } from '@/audio/grandmaSounds';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { METAL, paint, standard } from '../materials/palette';
import { SEAM } from '../props/joinery';
import { HoverGlint } from '../props/hoverGlint';
import { Steam } from '../kitchen/Steam';

/** Seconds from the gas lit to the whistle, how long it whistles before she takes it off, how long it takes to go quiet. */
const HEAT_SECONDS = 7;
const WHISTLE_SECONDS = 5;
const COOL_SECONDS = 3;
/** The voice is re-aimed this often (s). */
const VOICE_EVERY = 0.2;
const BODY = { r: 0.095, h: 0.13, base: 0.012, lid: 0.03 };

/**
 * Mémé's stovetop kettle on the cooker's front burner (`EnamelCooker.hob`): red enamel, a black bail handle, a
 * spout with its whistle. `whistle()` puts it on: it hisses up to the boil, steam curls from the spout, it whistles a
 * few seconds and is taken off. A click does the same. Its voice (`sound`) goes on a `PointSound` by the builder.
 * Origin on the burner's top under its middle. Never collides.
 */
export class WhistlingKettle extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  readonly sound = new KettleWhistle();
  private readonly steam = new Steam({ count: 26, life: 2, rise: 0.25 });
  private readonly glint: HoverGlint;
  /** Seconds since it was put on, or -1 when cold. */
  private phase = -1;
  private voiceIn = 0;

  constructor() {
    super();
    this.name = 'WhistlingKettle';
    const enamel = standard({ color: 0xb8302a, roughness: 0.2, metalness: 0 });
    const black = paint(0x1a1918, 0.5);
    this.add(cylinderMesh(BODY.r * 0.92, BODY.base, black, { y: BODY.base / 2 }, { segments: 24 }));
    const bodyY = BODY.base + SEAM;
    this.add(cylinderMesh(BODY.r * 0.82, BODY.h, enamel, { y: bodyY + BODY.h / 2 }, { radiusBottom: BODY.r, segments: 24 }));
    const lidY = bodyY + BODY.h + SEAM;
    this.add(cylinderMesh(BODY.r * 0.45, BODY.lid, enamel, { y: lidY + BODY.lid / 2 }, { radiusBottom: BODY.r * 0.8, segments: 20 }));
    const knob = cylinderMesh(0.014, 0.02, black, { y: lidY + BODY.lid + SEAM + 0.01 }, { segments: 12 });
    this.add(knob);
    // The spout leaning out to +x, its whistle cap at the tip.
    const spout = cylinderMesh(0.012, 0.12, enamel, { x: BODY.r + 0.02, y: bodyY + BODY.h * 0.6 }, { radiusBottom: 0.022, segments: 12 });
    spout.rotation.z = -0.9;
    this.add(spout);
    const tipAt = new THREE.Vector3(BODY.r + 0.02 + Math.sin(0.9) * 0.06, bodyY + BODY.h * 0.6 + Math.cos(0.9) * 0.06, 0);
    const cap = cylinderMesh(0.015, 0.025, METAL.chrome(), { x: tipAt.x, y: tipAt.y }, { segments: 10 });
    cap.rotation.z = -0.9;
    this.add(cap);
    // The bail handle over the lid, front to back.
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 8, 20, Math.PI), black);
    bail.position.y = lidY + 0.01;
    bail.rotation.y = Math.PI / 2;
    bail.castShadow = true;
    this.add(bail);
    this.glint = HoverGlint.of(cap, knob);
    this.steam.position.copy(tipAt).add(new THREE.Vector3(Math.sin(0.9) * 0.015, Math.cos(0.9) * 0.015, 0));
    this.add(this.steam);
    const hitbox = invisibleHitbox(0.28, 0.26, 0.22, { x: 0.03, y: 0.13 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get isOn(): boolean {
    return this.phase >= 0;
  }

  /** Put on the gas: the boil, the whistle, then off. */
  whistle(): void {
    if (this.phase < 0 || this.phase > HEAT_SECONDS + WHISTLE_SECONDS) this.phase = 0;
  }

  update(dt: number): void {
    if (this.phase >= 0) {
      this.phase += dt;
      if (this.phase > HEAT_SECONDS + WHISTLE_SECONDS + COOL_SECONDS) this.phase = -1;
    }
    const amount = this.amount();
    this.steam.rate = THREE.MathUtils.smoothstep(amount, 0.4, 1);
    this.steam.update(dt);
    this.voiceIn -= dt;
    if (this.voiceIn <= 0) {
      this.voiceIn = VOICE_EVERY;
      this.sound.setWhistle(amount);
    }
  }

  /** 0 cold .. 0.5 the hiss before the boil .. 1 the full whistle. */
  private amount(): number {
    const t = this.phase;
    if (t < 0) return 0;
    if (t < HEAT_SECONDS) return (t / HEAT_SECONDS) * 0.55;
    if (t < HEAT_SECONDS + WHISTLE_SECONDS) return 1;
    return Math.max(0, 1 - (t - HEAT_SECONDS - WHISTLE_SECONDS) / COOL_SECONDS);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return this.isOn ? 'Mémé’s kettle' : 'Mémé’s kettle · put it on';
  }

  activate(): void {
    this.whistle();
  }
}

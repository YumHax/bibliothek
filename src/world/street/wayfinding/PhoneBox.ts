import * as THREE from 'three';
import { WALL, onSurface } from '@/world/surface/layers';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { DayNight } from '../../props/DayNight';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { formatCoins } from '@/text/money';
import type { Furniture } from '../../Furniture';
import { boxMesh, invisibleHitbox } from '../../meshUtils';
import { paint, standard } from '../../materials/palette';
import { snowPaint } from '../snowCover';
import { random } from '@/random';

/** The kiosk: its plan's side, the height of its frame, the roof's. */
const BOOTH = { side: 0.92, height: 2.3, roof: 0.18 };
/** How thick the frame's posts and rails are. */
const BAR = 0.06;

/**
 * The phone box on the far pavement (`STREET_PLACES.phoneBox`): a red kiosk, glazed in small panes, TELEPHONE lit
 * in its roof's band after dark, the handset on the back wall. Clicked, a call (`call`, the builder's: a coin in,
 * then the phone's book, the same people and small ads as the bedroom's phone). Its door is its front (local +z).
 * Now and then it rings (`ringing`, the builder's bell and who is on the line); picked up, the ringing stops. Collides.
 */
export class PhoneBox extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  private readonly sign: THREE.MeshStandardMaterial;
  /** Seconds to the next ringing, left of this one (while it rings), and to its next double ring. */
  private quiet: number;
  private ringingFor = 0;
  private bellIn = 0;

  constructor(
    private readonly dayNight: DayNight,
    private readonly options: {
      price: number;
      call: (session: SessionActions) => void;
      /** When it rings by itself: how often and how long (s), its bell (`StreetCues.phoneRing`), the caller once answered. */
      ringing?: { every: readonly [number, number]; for: number; bell: number; ring: () => void; answer: (session: SessionActions) => void };
    },
  ) {
    super();
    this.name = 'PhoneBox';
    const red = snowPaint(0xa8141a, 0.45);
    const glass = standard({ color: 0xd8e6ea, roughness: 0.08, transparent: true, opacity: 0.2, depthWrite: false });
    const { side, height, roof } = BOOTH;
    const half = side / 2;
    // Corner posts, the plinth, the rails between the panes on each side.
    for (const x of [-half + BAR / 2, half - BAR / 2]) for (const z of [-half + BAR / 2, half - BAR / 2]) this.add(boxMesh(BAR, height, BAR, red, { x, y: height / 2, z }));
    this.add(boxMesh(side + 0.04, 0.1, side + 0.04, paint(0x2a2a2a, 0.8), { y: 0.05 }));
    for (const face of [0, 1, 2, 3]) {
      const yaw = (face * Math.PI) / 2;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      const at = (along: number, y: number, out: number): { x: number; y: number; z: number } => ({ x: s * out + c * along, y, z: c * out - s * along });
      const out = half - BAR / 2;
      for (const y of [0.1, 0.95, 1.45, 1.95, height - 0.03]) {
        const rail = boxMesh(face % 2 ? BAR * 0.6 : side - BAR * 2, BAR * 0.6, face % 2 ? side - BAR * 2 : BAR * 0.6, red, at(0, y, out));
        this.add(rail);
      }
      // The glass over the rails, a sheet a side; the back's lower half is the panel the phone hangs on.
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(side - BAR * 2, height - 1.0), glass);
      const centre = at(0, 0.95 + (height - 0.95) / 2, out);
      pane.position.set(centre.x, centre.y, centre.z);
      pane.rotation.y = yaw;
      this.add(pane);
      if (face === 2) this.add(boxMesh(side - BAR * 2, 0.85, 0.02, red, at(0, 0.53, out)));
    }
    // The roof: a stepped red block, TELEPHONE in a band on each face (lit after dark).
    // Its own material (its emissive dimmed by the hour), one canvas for both maps: freed with the box on unload.
    const lettering = signTexture();
    this.sign = onSurface(new THREE.MeshStandardMaterial({ map: lettering, emissive: 0xffffff, emissiveMap: lettering, emissiveIntensity: 0, roughness: 0.5 }), WALL.sign);
    this.add(boxMesh(side + 0.02, roof, side + 0.02, red, { y: height + roof / 2 }));
    this.add(boxMesh(side - 0.1, 0.08, side - 0.1, red, { y: height + roof + 0.04 }));
    for (const face of [0, 1, 2, 3]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(side - 0.16, 0.11), this.sign);
      const yaw = (face * Math.PI) / 2;
      // On the roof block's face (half + 1 cm) by a sign's layer: lifted, and drawn over it however far off.
      const off = half + 0.01 + WALL.sign.lift;
      band.position.set(Math.sin(yaw) * off, height + roof / 2, Math.cos(yaw) * off);
      band.rotation.y = yaw;
      this.add(band);
    }
    // The phone on the back panel: its box, the handset on the hook.
    const black = paint(0x161616, 0.4);
    this.add(boxMesh(0.2, 0.28, 0.1, black, { y: 1.25, z: -half + 0.11 }));
    this.add(boxMesh(0.05, 0.22, 0.05, black, { x: -0.13, y: 1.26, z: -half + 0.13 }));
    const hitbox = invisibleHitbox(side, height, side, { y: height / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.quiet = this.nextQuiet() / 2;
  }

  private nextQuiet(): number {
    const every = this.options.ringing?.every ?? [Infinity, Infinity];
    return every[0] + random() * (every[1] - every[0]);
  }

  get footprint(): THREE.Box3 {
    const half = BOOTH.side / 2 + 0.02;
    return new THREE.Box3(new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, BOOTH.height + BOOTH.roof, half));
  }

  update(dt: number): void {
    // TELEPHONE lights up with the street lamps.
    this.sign.emissiveIntensity = (1 - this.dayNight.state.daylight) * 1.4;
    const ringing = this.options.ringing;
    if (!ringing) return;
    if (this.ringingFor > 0) {
      this.ringingFor -= dt;
      this.bellIn -= dt;
      if (this.bellIn <= 0 && this.ringingFor > 0) {
        this.bellIn = ringing.bell;
        ringing.ring();
      }
      if (this.ringingFor <= 0) this.quiet = this.nextQuiet();
      return;
    }
    this.quiet -= dt;
    if (this.quiet <= 0) {
      this.ringingFor = ringing.for;
      this.bellIn = 0;
    }
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    if (this.ringingFor > 0) return 'Phone box · it’s ringing: pick up';
    return `Phone box · make a call (${formatCoins(this.options.price)})`;
  }

  activate(session: SessionActions): void {
    const ringing = this.options.ringing;
    if (ringing && this.ringingFor > 0) {
      this.ringingFor = 0;
      this.quiet = this.nextQuiet();
      ringing.answer(session);
      return;
    }
    this.options.call(session);
  }
}

/** TELEPHONE, white on black, as on the roof's band. */
function signTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 32);
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#f4f0e6';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TELEPHONE', 128, 17, 240);
  return toTexture(canvas, 'facing');
}

import * as THREE from 'three';
import { poweredAt } from '@/building/mains';
import type { Updatable } from '@/core/Engine';
import type { CssLayer } from '@/core/CssLayer';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { unplayableWhy } from './box/unplayable';
import type { RegionLock } from '@/economy/regionLock';
import { CrtSpeaker } from '@/audio/CrtSpeaker';
import type { ActivityAware, Furniture } from './Furniture';
import { boxMesh, cylinderMesh } from './meshUtils';
import type { SoundOcclusion } from './acoustics/SoundOcclusion';
import { VideoSurface } from './screen';
import { SurfaceScreen } from './screen/SurfaceScreen';
import { CrtGlass } from './screen/CrtGlass';
import { HueDrift } from './screen/HueDrift';
import { QUALITY } from '@/graphics/quality';
import { paint, timber } from '@/world/materials/palette';
import { PROUD } from './props/joinery';
import type { MediaDecks } from './media/MediaDeck';

/** Height of the built-in cabinet the CRT sits on when nothing else carries it (see `mountOn`). */
const OWN_CABINET_HEIGHT = 0.55;
/** Screen glow: bluish light thrown into the room while a video plays. */
const GLOW_COLOR = 0xa9c7ff;
const GLOW_PLAYING = 3;
const GLOW_MESSAGE = 0.7;
/** The same glow as a soft panel the size of the picture (`QUALITY.areaLights`), per unit of point-light glow. */
const PANEL_PER_GLOW = 1.4;
/** A CRT's little speaker never gets as loud as the projector's sound system. */
const SPEAKER_GAIN = 0.8;
/** The power LED: a dim red standby, green while the set is on. */
const LED_STANDBY = new THREE.Color(0xff2a1a).multiplyScalar(0.35);
const LED_ON = new THREE.Color(0x2aff5a).multiplyScalar(1.4);
/** Share of the body's depth that is the front shell; the rest tapers back round the tube's neck. */
const FRONT_SHARE = 0.4;
/** The rear's back face, as a share of the front's width and height. */
const REAR_TAPER = { w: 0.56, h: 0.62 };
/** How far the middle of the glass stands in front of its edges, for a 27" tube (m). */
const GLASS_BULGE = 0.006;

interface TelevisionOptions {
  /** Object whose distance and facing drive the volume (the camera). */
  listener?: THREE.Object3D;
  /** Walls between the listener and the screen damp the volume (see `SoundOcclusion`). */
  occlusion?: SoundOcclusion;
  /** Width of the picture (m). Default 0.56, a 27" set; a portable is about 0.3. */
  screenWidth?: number;
}

/**
 * A CRT television on a cabinet. The picture is a `VideoSurface` (cut-out over a YouTube
 * iframe) set into the front of the body; the volume follows the `listener` (the camera).
 * A soft point light in front of the glass flickers while playing so the room reads as "TV on",
 * and a `CrtSpeaker` bed (hum, hiss, crackle) makes the sound read as "old TV".
 */
export class Television extends SurfaceScreen implements Furniture, Updatable, Interactable, ActivityAware {
  readonly hitboxes: THREE.Object3D[];
  readonly screenName = 'TV';

  /** Whether a copy plays here at all (a Japanese one needs its converter, `economy/regionLock`); set by the room's builder. */
  regionLock: RegionLock | null = null;
  private readonly screenWidth: number;
  /** Size of the set, for the collider. */
  private readonly bodySize: THREE.Vector3;
  /** The CRT set itself (body, screen, glow); lifted to whatever it stands on. */
  private readonly crt = new THREE.Group();
  private readonly cabinet: THREE.Mesh;
  protected readonly surface: VideoSurface;
  private readonly glow: THREE.PointLight;
  /** The picture as a soft area light (high quality); the point glow then only stands in for its falloff. */
  private readonly panel: THREE.RectAreaLight | null = null;
  private readonly glass: CrtGlass;
  private readonly hue = new HueDrift();
  private readonly speaker = new CrtSpeaker();
  private glowTime = 0;
  /** The power button: the one part that glints under the crosshair. */
  private readonly buttonMaterial: THREE.MeshStandardMaterial;
  private readonly ledMaterial: THREE.MeshStandardMaterial;
  /** The front face of the set's shell (crt-local z): the picture sits on it, the collider reaches `bodySize.z` back from it. */
  private readonly frontZ: number;
  private readonly glowScale: number;
  /** Whether the tube is lit (anything but off): the power-on and power-off animations run on its changes. */
  private powered = false;
  /** The consoles under the set: a game goes into its console, not into the TV. */
  private decks: MediaDecks | null = null;

  constructor(cssLayer: CssLayer, { listener, occlusion, screenWidth = 0.56 }: TelevisionOptions = {}) {
    super();
    this.name = 'Television';
    this.screenWidth = screenWidth;
    /** A smaller tube is shallower and throws less light. */
    const scale = screenWidth / 0.56;

    this.cabinet = boxMesh(0.9, OWN_CABINET_HEIGHT, 0.45, timber(0x3b2a1e, 0.7), {
      y: OWN_CABINET_HEIGHT / 2,
    });

    this.surface = new VideoSurface(cssLayer, {
      width: this.screenWidth,
      listener,
      occlusion,
      idle: 'glass',
      volume: { referenceDistance: 1.5, rolloff: 1.5, maxDistance: 12, rearGain: 0.5 }, // the armchair sits just inside the reference: full volume when seated
      gain: SPEAKER_GAIN,
    });
    // The tube lights up (thump, hiss, the line opening) as soon as the search begins; it collapses when switched off.
    this.surface.onStateChange((state) => {
      const on = state !== 'off';
      this.speaker.setOn(on);
      this.glass.setPlaying(on);
      if (on === this.powered) return;
      this.powered = on;
      if (on) this.glass.powerOn();
      else this.glass.powerOff();
    });

    // CRT body: a front shell round the picture, the rear tapering back round the tube's neck. Local y = 0 is the underside of the set.
    const bodyW = this.screenWidth + 0.14 * scale;
    const bodyH = this.surface.height + 0.14 * scale;
    const bodyD = 0.45 * Math.sqrt(scale);
    this.bodySize = new THREE.Vector3(bodyW, bodyH, bodyD);
    this.frontZ = -0.02 + bodyD / 2;
    const shell = paint(0x2a2a2e, 0.55);
    const frontD = bodyD * FRONT_SHARE;
    const front = boxMesh(bodyW, bodyH, frontD, shell, { y: bodyH / 2, z: this.frontZ - frontD / 2 });
    const rear = taperedRear(bodyW * 0.97, bodyH * 0.95, bodyD - frontD, shell);
    rear.position.set(0, bodyH * 0.52, this.frontZ - frontD - (bodyD - frontD) / 2);
    this.hitboxes = [front, rear];

    // Picture on the front face of the shell, facing +z, the tube's glass bulging just in front of it inside a bezel.
    this.surface.position.set(0, front.position.y, this.frontZ + PROUD);
    this.glass = new CrtGlass(this.screenWidth, this.surface.height, GLASS_BULGE * scale);
    this.glass.position.copy(this.surface.position).add(new THREE.Vector3(0, 0, 0.0015));
    const details = this.frontDetails(bodyW, bodyH, frontD, scale);
    this.buttonMaterial = details.button;
    this.ledMaterial = details.led;

    // No shadows: a shadow-casting point light costs six passes and the glow is meant to be soft.
    this.glow = new THREE.PointLight(GLOW_COLOR, 0, 3.5, 2);
    this.glowScale = scale;
    this.glow.position.copy(this.surface.position).add(new THREE.Vector3(0, 0, 0.35));

    this.crt.position.y = OWN_CABINET_HEIGHT;
    this.crt.add(front, rear, ...details.parts, this.surface, this.glass, this.glow);
    if (QUALITY.areaLights) {
      this.panel = new THREE.RectAreaLight(GLOW_COLOR, 0, this.screenWidth, this.surface.height);
      this.panel.position.copy(this.surface.position).add(new THREE.Vector3(0, 0, 0.01));
      this.panel.rotation.y = Math.PI; // lights look down their -z: turned to face the room
      this.crt.add(this.panel);
    }
    this.add(this.cabinet, this.crt);
  }

  /** Bounding box for collisions (local space): the built-in cabinet and the set on it, or the set's own size once mounted. */
  get footprint(): THREE.Box3 {
    const top = this.crt.position.y + this.bodySize.y;
    const back = this.frontZ - this.bodySize.z;
    const face = this.frontZ + 0.015; // the bezel and the glass's bulge
    if (!this.cabinet.visible) {
      const half = this.bodySize.x / 2;
      return new THREE.Box3(new THREE.Vector3(-half, this.crt.position.y, back), new THREE.Vector3(half, top, face));
    }
    const half = Math.max(0.45, this.bodySize.x / 2);
    return new THREE.Box3(new THREE.Vector3(-half, 0, Math.min(-0.25, back)), new THREE.Vector3(half, top, Math.max(0.25, face)));
  }

  /**
   * Stands the set on something else (e.g. a console stand) whose top is `height` above the TV's
   * origin: the built-in cabinet disappears and the CRT moves to that height.
   */
  mountOn(height: number): void {
    this.cabinet.visible = false;
    this.crt.position.y = height;
  }

  // --- Interactable -------------------------------------------------------------------------

  /** Only the power button glints: the set itself does not light up under the crosshair. */
  setHovered(hovered: boolean): void {
    this.buttonMaterial.emissive.setHex(hovered ? 0x4a4a52 : 0x000000);
  }

  /** The consoles plugged into it (the stand under it): a box in hand goes into its console, an empty hand switches on the last one in. */
  setDecks(decks: MediaDecks): void {
    this.decks = decks;
  }

  label(player: PlayerState): string | null {
    const held = player.held;
    if (held) {
      if (!held.playable) return `TV · can’t play it, ${unplayableWhy(held)}`;
      const deck = this.decks?.forPlatform(held.game.platform);
      if (deck?.busy) return `TV · the ${deck.deckName} is busy…`;
      if (deck && deck.loaded?.game.id !== held.game.id) return `TV · put ${held.game.title} in the ${deck.deckName}`;
      return `TV · play ${held.game.title}`;
    }
    if (this.state === 'searching') return `TV · looking for a longplay of ${this.surface.searchingFor ?? 'the game'}…`;
    if (this.surface.tuning) return 'TV · tuning in…';
    if (this.state === 'error') return 'TV, no longplay found · switch off';
    if (this.state !== 'off') return 'TV · switch off';
    const last = this.decks?.lastLoaded()?.loaded;
    return last ? `TV · switch on, ${last.game.title}` : 'TV · bring a game box';
  }

  /**
   * With a box in hand, its cartridge goes into its console under the set, which plays it (straight
   * on the TV when no console takes it); with empty hands, switches the set off, even while it is
   * still searching, or on again with the game last put in.
   */
  activate(session: SessionActions): void {
    if (!poweredAt(this)) return session.refuse('No power: the whole building is dark.');
    const box = session.held;
    if (box && !box.playable) {
      session.refuse(`${box.game.title} is ${unplayableWhy(box)}: no cartridge to put in.`);
    } else if (box) {
      const deck = this.decks?.forPlatform(box.game.platform);
      if (deck) return deck.insert(session, box);
      const locked = this.regionLock?.(box.game);
      if (locked) return session.refuse(locked);
      session.putBack();
      void session.playOn(this, box);
    } else if (this.state !== 'off') {
      session.stopScreen(this);
    } else {
      const last = this.decks?.lastLoaded()?.loaded;
      if (last) void session.playOn(this, last);
    }
  }

  /** Dormant zone: the picture lets its video go and the speaker's bed falls silent; both come back with the zone. */
  setZoneActive(active: boolean): void {
    this.surface.setZoneActive(active);
    this.speaker.setZoneActive(active);
  }

  /** Zone unload: the iframe leaves the page and the speaker's oscillators stop. */
  dispose(): void {
    this.surface.dispose();
    this.speaker.dispose();
  }

  update(dt: number): void {
    // A power cut in the building (`building/mains`): the picture goes at once.
    if (this.state !== 'off' && !poweredAt(this)) this.stop();
    this.updateGlow(dt);
    this.surface.update(dt);
    this.glass.update(dt);
    this.speaker.setLoudness(this.surface.loudness);
    if (this.state !== 'off') this.speaker.setSpatial(this.surface.pan, this.surface.walls); // the bed sits where the set is, like the video
    this.speaker.update(dt);
  }

  /** Screen light: a gentle flicker while playing, a steady dim glow over the static; the power LED follows. */
  private updateGlow(dt: number): void {
    let target = 0;
    if (this.state === 'playing') {
      this.glowTime += dt;
      const t = this.glowTime;
      const flicker = 0.5 * Math.sin(t * 11.3) + 0.3 * Math.sin(t * 6.1) + 0.2 * Math.sin(t * 1.7);
      target = GLOW_PLAYING * this.glowScale * (0.85 + 0.15 * flicker);
    } else if (this.state !== 'off') {
      target = GLOW_MESSAGE * this.glowScale;
    }
    // Ease so switching the set on or off does not pop.
    this.glow.intensity += (target - this.glow.intensity) * Math.min(1, dt * 6);

    // The hue drifts from one to the next while playing; the static glows the plain bluish white.
    if (this.state === 'playing') this.glow.color.copy(this.hue.update(dt));
    else this.glow.color.set(GLOW_COLOR);
    this.ledMaterial.emissive.lerp(this.state === 'off' ? LED_STANDBY : LED_ON, Math.min(1, dt * 8));
    if (this.panel) {
      this.panel.color.copy(this.glow.color);
      this.panel.intensity = this.glow.intensity * PANEL_PER_GLOW;
    }
  }

  /**
   * The front's details, on the shell's face and sides (crt-local): the bezel framing the tube, the
   * power button and its LED under the picture, the grille slots down both sides.
   */
  private frontDetails(bodyW: number, bodyH: number, frontD: number, scale: number): { parts: THREE.Mesh[]; button: THREE.MeshStandardMaterial; led: THREE.MeshStandardMaterial } {
    const parts: THREE.Mesh[] = [];
    const y = this.surface.position.y;
    const w = this.screenWidth;
    const h = this.surface.height;
    // Bezel: four bars round the picture, standing out of the face so the bulging glass sits in a recess.
    const bezel = paint(0x1d1d20, 0.45);
    const rim = 0.014 * scale;
    const depth = 0.012;
    const z = this.frontZ + depth / 2;
    parts.push(
      boxMesh(w + 2 * rim, rim, depth, bezel, { y: y + h / 2 + rim / 2, z }),
      boxMesh(w + 2 * rim, rim, depth, bezel, { y: y - h / 2 - rim / 2, z }),
      boxMesh(rim, h, depth, bezel, { x: -w / 2 - rim / 2, y, z }),
      boxMesh(rim, h, depth, bezel, { x: w / 2 + rim / 2, y, z }),
    );
    // Power button and LED, in the band under the picture, right-hand side.
    const band = (bodyH - h) / 4;
    const button = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.35, metalness: 0 });
    const knob = cylinderMesh(0.008 * scale, 0.006, button, { x: bodyW / 2 - 0.05 * scale, y: band, z: this.frontZ + 0.003 }, { segments: 16 });
    knob.rotation.x = Math.PI / 2;
    const led = new THREE.MeshStandardMaterial({ color: 0x1a0806, emissive: LED_STANDBY.clone(), roughness: 0.3 });
    const lamp = boxMesh(0.005 * scale, 0.005 * scale, 0.003, led, { x: bodyW / 2 - 0.075 * scale, y: band, z: this.frontZ + 0.0015 });
    parts.push(knob, lamp);
    // Grille slots down both sides, towards the back of the shell.
    const slot = paint(0x121214, 0.8);
    const slots = 6;
    for (const side of [-1, 1]) {
      for (let i = 0; i < slots; i++) {
        const sy = bodyH * (0.3 + (0.45 * i) / (slots - 1));
        parts.push(boxMesh(0.002, 0.006 * scale, frontD * 0.55, slot, { x: side * (bodyW / 2 + 0.001), y: sy, z: this.frontZ - frontD * 0.55 }));
      }
    }
    for (const small of parts.slice(4)) small.castShadow = false;
    return { parts, button, led };
  }
}

/**
 * The back of a CRT: a box whose rear face shrinks to `REAR_TAPER` of its front (`width` x `height`),
 * `depth` long, centred on its origin. Its own geometry (never a shared one).
 */
function taperedRear(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    if (position.getZ(i) > 0) continue; // the front face keeps its size
    position.setX(i, position.getX(i) * REAR_TAPER.w);
    position.setY(i, position.getY(i) * REAR_TAPER.h - height * 0.04);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

export interface MoodLampOptions {
  prizes: OwnedPrizes;
  /** The prize that brings it home. Default 'moodLamp'. */
  prizeId?: string;
}

/** The colours a click goes round, and "off". */
const COLORS: readonly { name: string; hex: number | null }[] = [
  { name: 'magenta', hex: 0xff2fa0 },
  { name: 'cyan', hex: 0x33e0ff },
  { name: 'violet', hex: 0xb05cff },
  { name: 'amber', hex: 0xffb347 },
  { name: 'green', hex: 0x39ff9e },
  { name: 'rainbow', hex: -1 },
  { name: 'off', hex: null },
];
const STORAGE_KEY = 'bibliothek.moodLamp.v1';
const RADIUS = 0.07;

/**
 * The neon mood lamp won at the prize counter, standing on a piece of bedroom furniture: a glowing
 * egg on a black base that lights its corner in one colour. A click goes to the next colour
 * (magenta, cyan, violet, amber, green, a slow rainbow, off), remembered across visits. Its light
 * is small and casts no shadow. Hidden (and unclickable) until the prize is owned. Origin under
 * its base; never collides.
 */
export class MoodLamp extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly body = new THREE.Group();
  private readonly shade: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly unsubscribe: () => void;
  private colour: number;
  private owned = false;
  private clock = 0;

  constructor(options: MoodLampOptions) {
    super();
    this.name = 'MoodLamp';
    this.colour = readColour();
    this.body.add(cylinderMesh(0.05, 0.03, matte(0x151518, 0.4), { y: 0.015 }, { segments: 20 }));
    this.shade = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff2fa0, emissiveIntensity: 1.6, roughness: 0.3 });
    const egg = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 24, 16), this.shade);
    egg.scale.y = 1.35;
    egg.position.y = 0.03 + RADIUS * 1.3;
    this.body.add(egg);
    this.light = new THREE.PointLight(0xff2fa0, 0.8, 2.4, 2);
    this.light.position.y = 0.14;
    this.light.castShadow = false;
    this.body.add(this.light);
    this.add(this.body);
    const hitbox = invisibleHitbox(0.16, 0.24, 0.16, { y: 0.12 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.unsubscribe = showWhenOwned(options.prizes, options.prizeId ?? 'moodLamp', this.body, hitbox, (owned) => {
      this.owned = owned;
      this.apply();
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(hovered: boolean): void {
    this.shade.color.setHex(hovered ? 0xffffff : 0xeeeeee);
  }

  label(): string | null {
    if (!this.owned) return null;
    const next = COLORS[(this.colour + 1) % COLORS.length]!;
    return `Mood lamp (${COLORS[this.colour]!.name}) — click for ${next.name}`;
  }

  activate(): void {
    if (!this.owned) return;
    this.colour = (this.colour + 1) % COLORS.length;
    try {
      localStorage.setItem(STORAGE_KEY, String(this.colour));
    } catch {
      /* the colour is a convenience */
    }
    this.apply();
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.owned || COLORS[this.colour]!.hex !== -1) return;
    const c = new THREE.Color().setHSL((this.clock * 0.04) % 1, 0.9, 0.55);
    this.shade.emissive.copy(c);
    this.light.color.copy(c);
  }

  dispose(): void {
    this.unsubscribe();
  }

  private apply(): void {
    const { hex } = COLORS[this.colour]!;
    const on = this.owned && hex !== null;
    this.light.visible = on;
    this.shade.emissiveIntensity = on ? 1.6 : 0;
    if (hex !== null && hex !== -1) {
      this.shade.emissive.setHex(hex);
      this.light.color.setHex(hex);
    }
  }
}

function readColour(): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < COLORS.length ? saved : 0;
  } catch {
    return 0;
  }
}

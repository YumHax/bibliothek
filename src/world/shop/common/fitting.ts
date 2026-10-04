import * as THREE from 'three';
import type { AmbientVoice } from '@/audio/ambient';
import type { HearingProfile } from '@/audio/hearing';
import { LAMP_GLOW, type LampKind } from '../../lighting/lampColours';

/**
 * A light fitting of a shop's own (a tube batten, track spots, a lamp's glowing shade, an aquarium's glow): worked by
 * the shop's one switch with the ceiling lamp (`furnishShop`), `setLit(true)` once built. Shadowless by rule: its
 * glow is emissive, and what light it throws on the room is `PooledLight`s lent a real light by the shop's `LightPool`.
 */
export interface ShopFitting {
  setLit(on: boolean): void;
}

export function isShopFitting(obj: object): obj is ShopFitting {
  return typeof (obj as Partial<ShopFitting>).setLit === 'function';
}

/** One sound a prop makes, placed by `furnishShop` at `at` (the prop's local frame) on a `PointSound`. */
export interface PropVoice {
  voice: AmbientVoice;
  at: THREE.Vector3;
  options?: HearingProfile;
}

/** A prop that sounds (a tube's hum, a pump, a fridge): `furnishShop` places its voices once it stands. */
export interface ShopVoiced {
  voices(): readonly PropVoice[];
}

export function isShopVoiced(obj: object): obj is ShopVoiced {
  return typeof (obj as Partial<ShopVoiced>).voices === 'function';
}

/**
 * The glowing materials of a fitting (a tube's diffuser, a shade, a lens, a panel): each its own material (never a
 * palette one: its emissive changes), lit to `strength` times the switch's level. `setLit` eases nothing: the
 * shop's lamps come on with the switch.
 */
export class Glows {
  private readonly entries: { material: THREE.MeshStandardMaterial; strength: number }[] = [];

  /** A glowing material in the colour of its lamp `kind` (`LAMP_GLOW`) or `emissive`, `strength` when lit. */
  add(options: { color?: THREE.ColorRepresentation; kind?: LampKind; emissive?: THREE.ColorRepresentation; strength: number; roughness?: number; transparent?: boolean; opacity?: number }): THREE.MeshStandardMaterial {
    const emissive = options.emissive !== undefined ? new THREE.Color(options.emissive) : LAMP_GLOW[options.kind ?? 'incandescent'].clone();
    const material = new THREE.MeshStandardMaterial({
      color: options.color ?? 0xf6f2ea,
      emissive,
      emissiveIntensity: 0,
      roughness: options.roughness ?? 0.5,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
    });
    this.entries.push({ material, strength: options.strength });
    return material;
  }

  /** 0 dark .. 1 fully lit (a flicker passes a level in between). */
  set(level: number): void {
    for (const { material, strength } of this.entries) material.emissiveIntensity = strength * level;
  }
}

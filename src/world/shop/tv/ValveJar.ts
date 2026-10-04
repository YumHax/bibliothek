import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop } from '../../props/Prop';
import { paint, standard } from '../../materials/palette';
import { lcg } from '@/random';

export interface ValveJarOptions {
  /** Valves in it. Default 14. */
  count?: number;
  seed?: number;
}

const JAR = standard({ color: 0xe8f0ec, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 2 });
const LID = paint(0xb8342a, 0.45);
const VALVE = standard({ color: 0xd8dcd8, roughness: 0.12, metalness: 0.3 });
const GETTER = standard({ color: 0x6a6a70, roughness: 0.2, metalness: 1 });
const BASE = paint(0x1e1e20, 0.5);

/**
 * A big sweet jar of old valves on the counter (a sign of the trade, and a handful for a coin): the glass, its red
 * lid, the valves heaped inside standing and lying, their silvered tops and black bases. Origin on the counter under
 * the jar. Decoration: never collides.
 */
export class ValveJar extends Prop {
  readonly contactShadow = false;

  constructor(options: ValveJarOptions = {}) {
    super();
    this.name = 'ValveJar';
    const random = lcg(options.seed ?? 23);
    const R = 0.065;
    const H = 0.19;
    const count = options.count ?? 14;
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = random() * (R - 0.018);
      const layer = Math.floor(i / 5);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = 0.012 + layer * 0.035;
      const tall = 0.045 + random() * 0.02;
      // Glass, black base and silvered top, tipped as it fell in.
      const valve = new THREE.Group();
      valve.position.set(x, y + tall / 2, z);
      valve.rotation.set((random() - 0.5) * 1.6, 0, (random() - 0.5) * 1.6);
      valve.add(cylinderMesh(0.009, tall, VALVE, {}, { segments: 10 }));
      valve.add(cylinderMesh(0.0095, 0.008, BASE, { y: -tall / 2 + 0.003 }, { segments: 10 }));
      valve.add(cylinderMesh(0.0093, 0.006, GETTER, { y: tall / 2 - 0.002 }, { segments: 10 }));
      this.add(valve);
    }
    const glass = cylinderMesh(R, H, JAR, { y: H / 2 }, { segments: 24 });
    glass.castShadow = false;
    this.add(glass);
    this.add(cylinderMesh(R * 0.8, 0.03, LID, { y: H + 0.015 }, { segments: 24 }));
  }
}

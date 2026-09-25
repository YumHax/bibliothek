import * as THREE from 'three';
import type { PrizeKind } from '@/economy/Prizes';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';

const CHROME = new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.8, roughness: 0.25 });
const DARK = matte(0x1a1a1f, 0.5);
const WHITE = matte(0xf4f1ea, 0.5);

/** How tall each kind stands, metres (the shelf spaces them by it). */
export const PRIZE_HEIGHT: Record<PrizeKind, number> = {
  keyring: 0.05,
  ball: 0.05,
  yoyo: 0.06,
  duck: 0.08,
  bear: 0.16,
  cat: 0.15,
  rocket: 0.17,
  lavaLamp: 0.2,
  trophy: 0.19,
  miniCabinet: 0.18,
  plush: 0.13,
  catToy: 0.05,
  poster: 0.05,
  moodLamp: 0.19,
  pennant: 0.19,
  mystery: 0.08,
};

/**
 * A prize as a small model, standing on its base at local y = 0, facing +z: the keyring, the
 * bouncy ball, the yo-yo, the duck, the plush bear and cat, the tin rocket, the lava lamp (its
 * wax glows), the trophy, the mini cabinet (its screen glows) and the claw's bunnies. A few
 * dozen triangles each; nothing casts a shadow but the bigger ones.
 */
export function prizeModel(kind: PrizeKind, color: number): THREE.Group {
  const g = new THREE.Group();
  const paint = matte(color, 0.5);
  switch (kind) {
    case 'keyring': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 16), CHROME);
      ring.position.y = 0.035;
      g.add(ring, cylinderMesh(0.004, 0.02, CHROME, { y: 0.012 }, { segments: 6 }));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), paint);
      knob.position.y = 0.004;
      g.add(knob, boxMesh(0.018, 0.004, 0.018, DARK, { y: -0.002 }));
      g.position.y = 0.004;
      break;
    }
    case 'ball': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, emissive: color, emissiveIntensity: 0.15 }));
      ball.position.y = 0.025;
      g.add(ball);
      break;
    }
    case 'yoyo': {
      const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.3 });
      for (const z of [-0.008, 0.008]) {
        const half = cylinderMesh(0.028, 0.012, glow, { y: 0.028, z }, { segments: 18 });
        half.rotation.x = Math.PI / 2;
        g.add(half);
      }
      break;
    }
    case 'duck': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), paint);
      body.scale.set(1, 0.8, 1.3);
      body.position.y = 0.025;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), paint);
      head.position.set(0, 0.058, 0.02);
      const beak = boxMesh(0.014, 0.006, 0.014, matte(0xff8a2a, 0.5), { y: 0.056, z: 0.04 });
      const shades = boxMesh(0.03, 0.007, 0.004, DARK, { y: 0.064, z: 0.036 });
      g.add(body, head, beak, shades);
      break;
    }
    case 'bear':
    case 'cat':
    case 'plush': {
      const r = kind === 'plush' ? 0.042 : 0.05;
      const fur = matte(color, 1);
      const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur);
      body.position.y = r;
      const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.72, 14, 10), fur);
      head.position.set(0, r * 2.05, r * 0.15);
      g.add(body, head);
      for (const sx of [-1, 1]) {
        const ear =
          kind === 'cat'
            ? new THREE.Mesh(new THREE.ConeGeometry(r * 0.25, r * 0.45, 4), fur)
            : new THREE.Mesh(new THREE.SphereGeometry(r * (kind === 'plush' ? 0.24 : 0.26), 8, 6), fur);
        if (kind === 'plush') ear.scale.set(0.7, 2.4, 0.7);
        ear.position.set(sx * r * 0.45, r * (kind === 'plush' ? 2.95 : 2.65), r * 0.1);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 6, 5), DARK);
        eye.position.set(sx * r * 0.25, r * 2.15, r * 0.8);
        const paw = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 8, 6), fur);
        paw.position.set(sx * r * 0.75, r * 0.6, r * 0.5);
        g.add(ear, eye, paw);
      }
      if (kind === 'bear') {
        const snout = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 10, 8), matte(0xe8cfa8, 1));
        snout.position.set(0, r * 1.95, r * 0.75);
        g.add(snout);
      }
      body.castShadow = head.castShadow = true;
      break;
    }
    case 'rocket': {
      const tin = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 });
      g.add(cylinderMesh(0.022, 0.1, tin, { y: 0.06 }, { segments: 14 }));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 14), CHROME);
      nose.position.y = 0.135;
      g.add(nose);
      for (let i = 0; i < 3; i++) {
        const fin = boxMesh(0.004, 0.04, 0.03, tin, { y: 0.03 });
        const pivot = new THREE.Group();
        pivot.rotation.y = (i / 3) * Math.PI * 2;
        fin.position.z = 0.026;
        pivot.add(fin);
        g.add(pivot);
      }
      const window = cylinderMesh(0.008, 0.004, matte(0x9ad6ff, 0.2), { y: 0.08, z: 0.021 }, { segments: 12 });
      window.rotation.x = Math.PI / 2;
      g.add(window);
      break;
    }
    case 'lavaLamp': {
      g.add(cylinderMesh(0.02, 0.05, CHROME, { y: 0.025 }, { radiusBottom: 0.03, segments: 16 }));
      const glass = cylinderMesh(0.012, 0.11, new THREE.MeshStandardMaterial({ color: 0xffd0e8, emissive: 0xff7ab8, emissiveIntensity: 0.5, transparent: true, opacity: 0.7, roughness: 0.1 }), { y: 0.105 }, { radiusBottom: 0.022, segments: 16 });
      glass.castShadow = false;
      g.add(glass);
      const wax = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.4 });
      for (const [y, s] of [[0.075, 0.012], [0.11, 0.009], [0.14, 0.007]] as const) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), wax);
        blob.position.y = y;
        g.add(blob);
      }
      g.add(cylinderMesh(0.008, 0.025, CHROME, { y: 0.172 }, { radiusBottom: 0.014, segments: 12 }));
      break;
    }
    case 'trophy': {
      const gold = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.25 });
      g.add(boxMesh(0.07, 0.03, 0.07, DARK, { y: 0.015 }));
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016), new THREE.MeshBasicMaterial({ map: plateTexture() }));
      plate.position.set(0, 0.015, 0.0355);
      g.add(plate, cylinderMesh(0.008, 0.06, gold, { y: 0.06 }, { segments: 10 }));
      g.add(cylinderMesh(0.035, 0.07, gold, { y: 0.125 }, { radiusBottom: 0.012, segments: 16 }));
      for (const sx of [-1, 1]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 12, Math.PI), gold);
        handle.position.set(sx * 0.037, 0.13, 0);
        handle.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(handle);
      }
      break;
    }
    case 'catToy': {
      // A feather wand lying down: a stick, a string, a tuft of feathers.
      const stick = cylinderMesh(0.003, 0.16, matte(0xc8a060, 0.5), { y: 0.004 }, { segments: 6 });
      stick.rotation.z = Math.PI / 2;
      g.add(stick);
      for (let i = 0; i < 5; i++) {
        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.05, 5), matte(i % 2 ? color : 0xff2fa0, 0.6));
        feather.position.set(0.09 + Math.cos(i) * 0.008, 0.01, Math.sin(i * 1.7) * 0.012);
        feather.rotation.z = -Math.PI / 2 + (i - 2) * 0.3;
        g.add(feather);
      }
      break;
    }
    case 'poster': {
      // Rolled up with a rubber band.
      const roll = cylinderMesh(0.018, 0.14, paint, { y: 0.018 }, { segments: 12 });
      roll.rotation.z = Math.PI / 2;
      const band = cylinderMesh(0.0185, 0.006, DARK, { y: 0.018 }, { segments: 12 });
      band.rotation.z = Math.PI / 2;
      g.add(roll, band);
      break;
    }
    case 'moodLamp': {
      g.add(cylinderMesh(0.035, 0.02, DARK, { y: 0.01 }, { segments: 16 }));
      const shade = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.3 }));
      shade.position.y = 0.09;
      shade.scale.y = 1.4;
      g.add(shade);
      break;
    }
    case 'pennant': {
      g.add(cylinderMesh(0.003, 0.19, matte(0xc8a060, 0.5), { y: 0.095 }, { segments: 6 }));
      const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.19, 0), new THREE.Vector3(0.11, 0.155, 0), new THREE.Vector3(0, 0.12, 0)]), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }));
      flag.geometry.computeVertexNormals();
      g.add(flag, boxMesh(0.04, 0.008, 0.04, DARK, { y: 0.004 }));
      break;
    }
    case 'mystery': {
      // A gift-wrapped cartridge: a box, a ribbon both ways, a bow.
      g.add(boxMesh(0.07, 0.06, 0.05, paint, { y: 0.03 }));
      const ribbon = matte(0xe8303a, 0.4);
      g.add(boxMesh(0.072, 0.062, 0.01, ribbon, { y: 0.03 }), boxMesh(0.01, 0.062, 0.052, ribbon, { y: 0.03 }));
      for (const sx of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, 6, 12), ribbon);
        loop.position.set(sx * 0.01, 0.068, 0);
        loop.rotation.y = Math.PI / 2;
        g.add(loop);
      }
      break;
    }
    case 'miniCabinet': {
      const w = 0.07;
      g.add(boxMesh(w, 0.075, 0.07, paint, { y: 0.0375 }));
      g.add(boxMesh(w, 0.1, 0.055, paint, { y: 0.125, z: -0.0075 }));
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.6), new THREE.MeshBasicMaterial({ map: miniScreen(), toneMapped: false }));
      screen.position.set(0, 0.13, 0.021);
      screen.rotation.x = -0.15;
      g.add(screen, boxMesh(w, 0.02, 0.05, WHITE, { y: 0.17, z: -0.005 }));
      g.add(boxMesh(w, 0.012, 0.03, DARK, { y: 0.08, z: 0.02 }));
      const stick = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), matte(0xd23a3a, 0.4));
      stick.position.set(-0.015, 0.09, 0.025);
      g.add(stick);
      break;
    }
  }
  return g;
}

let plate: THREE.CanvasTexture | null = null;
function plateTexture(): THREE.CanvasTexture {
  if (plate) return plate;
  const [canvas, ctx] = createCanvas(128, 40);
  ctx.fillStyle = '#c9a23a';
  ctx.fillRect(0, 0, 128, 40);
  ctx.fillStyle = '#2a1a05';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCADE CHAMPION', 64, 21);
  plate = new THREE.CanvasTexture(canvas);
  plate.colorSpace = THREE.SRGBColorSpace;
  return plate;
}

let screen: THREE.CanvasTexture | null = null;
function miniScreen(): THREE.CanvasTexture {
  if (screen) return screen;
  const [canvas, ctx] = createCanvas(64, 48);
  ctx.fillStyle = '#07070c';
  ctx.fillRect(0, 0, 64, 48);
  const colors = ['#ff5f5f', '#ffb347', '#ffe066', '#7ee787'];
  colors.forEach((c, r) => {
    ctx.fillStyle = c;
    for (let x = 4; x < 60; x += 8) ctx.fillRect(x, 6 + r * 5, 6, 3);
  });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(26, 40, 12, 2);
  ctx.fillRect(34, 30, 2, 2);
  screen = new THREE.CanvasTexture(canvas);
  screen.colorSpace = THREE.SRGBColorSpace;
  screen.magFilter = THREE.NearestFilter;
  return screen;
}

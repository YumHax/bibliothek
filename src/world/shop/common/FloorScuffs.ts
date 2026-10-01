import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { Prop } from '../../props/Prop';
import { FLOOR, RENDER_ORDER, onSurface } from '../../surface/layers';

export interface FloorScuffsOptions {
  /** The patch's size along local x and z. Default 1.4 x 0.9. */
  width?: number;
  depth?: number;
  /** `heels`: black heel marks and scuffs (in front of a counter); `grime`: a grey trodden patch (a doorway, a bench); `petals`: fallen leaves and petals (the florist); `sawdust`: shavings and grit (a workshop). Default heels. */
  kind?: 'heels' | 'grime' | 'petals' | 'sawdust';
  /** 0..1, how much there is. Default 0.6. */
  amount?: number;
  seed?: number;
}

const PX_PER_M = 320;

/**
 * What a shop's floor gathers where people stand and work: heel marks in front of the counter, a trodden grey patch,
 * petals and leaves round the florist's buckets, grit under a workbench. A see-through decal on the floor's `scuff`
 * layer that darkens or dots the floor under it and never touches the canvas's alpha (the video cut-out). Floor
 * placement, centred on the origin. Decoration: never collides.
 */
export class FloorScuffs extends Prop {
  constructor(options: FloorScuffsOptions = {}) {
    super();
    this.name = 'FloorScuffs';
    const width = options.width ?? 1.4;
    const depth = options.depth ?? 0.9;
    const material = onSurface(new THREE.MeshStandardMaterial({ map: paint(width, depth, options), roughness: 0.9, transparent: true }), FLOOR.scuff, { depthWrite: false });
    // Blend the colour only: the alpha stays what the floor wrote.
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = FLOOR.scuff.lift;
    mesh.renderOrder = RENDER_ORDER.groundGlow;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.add(mesh);
  }
}

function paint(wM: number, dM: number, options: FloorScuffsOptions): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(dM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const random = seededRandom((options.seed ?? 5) * 48271 + 7);
  const amount = options.amount ?? 0.6;
  const kind = options.kind ?? 'heels';
  // Everything fades out towards the patch's edge, so it has no outline.
  const fade = (x: number, y: number): number => {
    const dx = (x / W - 0.5) * 2;
    const dy = (y / H - 0.5) * 2;
    return Math.max(0, 1 - Math.pow(dx * dx + dy * dy, 1.5));
  };
  if (kind === 'grime' || kind === 'heels') {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 2);
    g.addColorStop(0, `rgba(40,34,28,${0.22 * amount})`);
    g.addColorStop(1, 'rgba(40,34,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const marks = Math.round((kind === 'grime' ? 30 : 90) * amount * (wM * dM));
  for (let i = 0; i < marks * 4; i++) {
    const x = random() * W;
    const y = random() * H;
    const f = fade(x, y);
    if (random() > f) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    switch (kind) {
      case 'heels':
        ctx.strokeStyle = `rgba(20,18,16,${0.25 + random() * 0.35})`;
        ctx.lineWidth = 1 + random() * 2;
        ctx.beginPath();
        ctx.arc(0, 0, 4 + random() * 12, 0, Math.PI * (0.2 + random() * 0.5));
        ctx.stroke();
        break;
      case 'grime':
        ctx.fillStyle = `rgba(60,52,44,${0.08 + random() * 0.12})`;
        ctx.fillRect(-10, -3, 20 + random() * 30, 4 + random() * 8);
        break;
      case 'petals': {
        const colours = ['rgba(210,60,90,0.85)', 'rgba(240,230,240,0.85)', 'rgba(240,190,40,0.85)', 'rgba(70,120,50,0.85)', 'rgba(90,140,60,0.8)'];
        ctx.fillStyle = colours[Math.floor(random() * colours.length)]!;
        ctx.beginPath();
        ctx.ellipse(0, 0, 3 + random() * 4, 1.5 + random() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'sawdust':
        ctx.fillStyle = random() < 0.7 ? `rgba(200,170,120,${0.5 + random() * 0.4})` : `rgba(60,60,60,${0.4 + random() * 0.4})`;
        ctx.fillRect(0, 0, 1 + random() * 4, 1 + random() * 2);
        break;
    }
    ctx.restore();
  }
  return toTexture(canvas);
}

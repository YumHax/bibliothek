import * as THREE from 'three';
import type { Platform } from '@/catalog/types';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { buildConsole } from '../props/consoleStyles';
import { UsableProp, type UseOptions } from '../props/UsableProp';

/** The paper tag tied to it: its size (m) and canvas (px). */
const TAG = { w: 0.085, h: 0.05, px: [256, 150] as const };

/**
 * A console out of its place under the TV: one bought broken (on the seller's spares box, in TV REPAIR's crate, on the
 * kitchen chair waiting for the table) or mended, with a paper tag on its top ("SPARES OR REPAIR", "WORKS!"). The
 * console's own model (`consoleStyles.buildConsole`), its pad beside it; the click and the caption are the builder's
 * (`UseOptions`). `show` swaps the platform or empties it. Origin on whatever it stands on, +z its front.
 */
export class ConsoleProp extends UsableProp {
  private model: THREE.Group | null = null;
  private readonly tagMaterial: THREE.MeshStandardMaterial;
  private readonly tag: THREE.Mesh;
  private shown: { platform: string; text: string } | null = null;

  constructor(use: UseOptions) {
    super(use);
    this.name = 'ConsoleProp';
    this.target(0.32, 0.12, 0.3, { y: 0.06 });
    const [canvas] = createCanvas(TAG.px[0], TAG.px[1]);
    this.tagMaterial = new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.9 });
    this.tag = new THREE.Mesh(new THREE.PlaneGeometry(TAG.w, TAG.h), this.tagMaterial);
    this.tag.rotation.x = -Math.PI / 2;
    this.tag.userData.live = true;
    this.add(this.tag);
  }

  /** Shows `platform`'s console with `tag` written on its label, or nothing (null). */
  show(platform: Platform | null, tag = ''): void {
    const key = platform ? { platform: platform.id, text: tag } : null;
    if (key?.platform === this.shown?.platform && key?.text === this.shown?.text) return;
    if (this.model) this.remove(this.model);
    this.model = null;
    this.shown = key;
    this.tag.visible = !!platform && !!tag;
    if (!platform) return;
    const visual = buildConsole(platform);
    this.model = visual.group;
    this.model.traverse((obj) => (obj.userData.live = true));
    this.add(this.model);
    // The tag lies on the console's top, towards its back-right corner, a couple of millimetres over it.
    this.tag.position.set(visual.size.w * 0.22, visual.size.h + 0.003, -visual.size.d * 0.18);
    this.tag.rotation.z = 0.35;
    this.paintTag(tag);
  }

  private paintTag(text: string): void {
    const texture = this.tagMaterial.map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const [w, h] = TAG.px;
    ctx.fillStyle = '#efe4c8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c7b48a';
    ctx.beginPath();
    ctx.arc(26, h / 2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1a10';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    const size = lines.length > 1 ? 34 : 42;
    ctx.font = `bold ${size}px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, w / 2 + 12, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
    texture.needsUpdate = true;
  }

  dispose(): void {
    this.tagMaterial.map?.dispose();
    this.tagMaterial.dispose();
  }
}

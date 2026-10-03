import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { VideoScreen } from '../screen';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { playLatchClick } from '@/audio/furnitureSounds';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { paint, standard } from '../materials/palette';
import { Prop } from '../props/Prop';
import { foundChannels, onChannels, showOn, type Channel } from './channels';
import { onCoproChange } from '@/building/coproState';

export interface ChannelDialOptions {
  /** The set it tunes (the collection room's TV). */
  tv: VideoScreen;
  /** The game day and the hour: what each channel shows now. */
  day: () => number;
  hours: () => number;
}

/**
 * An old set-top tuner on the TV stand, its cable running up to the roof's aerial: it only appears
 * once the aerial has brought a channel in (`roof/channels`). Each click turns its dial to the next
 * channel found and the TV shows what that channel shows now (a longplay, `SessionActions.playOn`);
 * past the last, the TV goes back off. Origin on the stand's top, +z its front.
 */
export class ChannelDial extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly face: THREE.MeshStandardMaterial;
  private readonly knob: THREE.Mesh;
  private readonly unsubscribe: (() => void)[];
  /** The channel the dial stands on (an index into the found ones), -1 off. */
  private on = -1;

  constructor(private readonly options: ChannelDialOptions) {
    super();
    this.name = 'ChannelDial';
    this.add(boxMesh(0.22, 0.07, 0.16, paint(0x3a2e26, 0.5), { y: 0.035 }));
    this.face = new THREE.MeshStandardMaterial({ map: dialTexture(null), roughness: 0.4, emissive: 0xffb050, emissiveIntensity: 0, emissiveMap: null });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.045), this.face);
    face.position.set(-0.04, 0.036, 0.081);
    this.add(face);
    this.knob = cylinderMesh(0.018, 0.02, standard({ color: 0xc9a75b, metalness: 1, roughness: 0.32 }), { x: 0.06, y: 0.035, z: 0.09 }, { segments: 14 });
    this.knob.rotation.x = Math.PI / 2;
    this.add(this.knob);
    const hitbox = invisibleHitbox(0.26, 0.1, 0.2, { y: 0.05 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    // Shown once a channel is found: by the aerial, or the fibre the co-ownership voted in.
    const show = (): void => {
      this.visible = foundChannels().length > 0;
    };
    show();
    this.unsubscribe = [onChannels(show), onCoproChange(show)];
  }

  setHovered(hovered: boolean): void {
    this.face.emissiveIntensity = hovered ? 0.25 : 0;
  }

  label(): string | null {
    const found = foundChannels();
    if (!found.length) return null;
    const next = found[this.on + 1];
    return next ? `The old tuner · channel ${next.number}` : 'The old tuner · off';
  }

  activate(session: SessionActions): void {
    const found = foundChannels();
    if (!found.length) return;
    playLatchClick(0.05);
    this.on = this.on + 1 < found.length ? this.on + 1 : -1;
    this.knob.rotation.z = this.on * 0.7;
    const channel = this.on >= 0 ? found[this.on]! : null;
    this.face.map?.dispose();
    this.face.map = dialTexture(channel);
    this.face.needsUpdate = true;
    if (!channel) {
      session.stopScreen(this.options.tv);
      session.react('The tuner clicks back to nothing.');
      return;
    }
    const show = showOn(channel, this.options.day(), this.options.hours());
    if (!show) return;
    session.react(`${channel.name}: ${show.title}.`);
    void session.playOn(this.options.tv, { game: show });
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
  }
}

/** The tuner's little window: the channel's number in amber, or a dash. */
function dialTexture(channel: Channel | null): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 58);
  ctx.fillStyle = '#120c08';
  ctx.fillRect(0, 0, 128, 58);
  ctx.fillStyle = channel ? '#ffb347' : '#5a4430';
  ctx.font = 'bold 40px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(channel ? `CH ${channel.number}` : '--', 64, 31);
  return toTexture(canvas, 'facing');
}

import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { BRASS, PANEL_PITCH } from './liftBody';

/** A button's plate (width, height) and the box it is clicked in (width, height, depth), local. */
interface ButtonSize {
  plate: [number, number];
  hit: [number, number, number];
}

/** The call button on a landing's cage post; one of the car panel's, small enough for a row a floor. */
const CALL_BUTTON: ButtonSize = { plate: [0.1, 0.16], hit: [0.22, 0.3, 0.2] };
export const PANEL_BUTTON: ButtonSize = { plate: [0.04, 0.04], hit: [0.07, PANEL_PITCH, 0.08] };

/** A brass button (the call button on a landing, the panel in the car): a caption and a click. */
export class LiftButton extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly brass = BRASS.clone();

  constructor(private readonly caption: () => string, private readonly press: (session: SessionActions) => void, size: ButtonSize = CALL_BUTTON) {
    super();
    this.name = 'LiftButton';
    const plate = boxMesh(size.plate[0], size.plate[1], 0.02, this.brass);
    plate.castShadow = true;
    this.add(plate);
    const hitbox = invisibleHitbox(...size.hit);
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(hovered: boolean): void {
    this.brass.emissiveIntensity = hovered ? 0.5 : 0;
  }

  label(): string {
    return this.caption();
  }

  activate(session: SessionActions): void {
    this.press(session);
  }
}

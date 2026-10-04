import * as THREE from 'three';
import type { RoomOptions } from '@/world/Room';
import type { Zone } from '@/world/zone/Zone';
import { FLOOR, onSurface, RENDER_ORDER, WALL } from '@/world/surface/layers';
import { CELL, type Guide } from '../grid';
import { turnedBounds, wallNormal, type Pose, type Surface } from '../surfaces';
import { gridMaterial } from './gridMaterial';
import { BoxOutline } from './BoxOutline';

/** The footprint cells: green where the piece may stand, red where something is in the way. */
const FREE = new THREE.Color(0x8fe3a0);
const TAKEN = new THREE.Color(0xff6b5c);
const CELL_OPACITY = 0.42;
/** More cells than this (a big rug) are drawn two grid cells a side. */
const MAX_CELLS = 1600;
const GUIDE_COLOR = 0x7cc8ff;
const HOVER_COLOR = 0xfff2d0;

type Extent = Pick<RoomOptions, 'width' | 'depth' | 'height'>;

/** What the preview shows each frame while a piece is carried (every pose zone-local). */
interface PreviewState {
  /** Where the piece would be set down, and where it is drawn now (following the aim). */
  target: Pose;
  shown: Pose;
  fits: boolean;
  /** What stands in the way (world box), outlined in red. */
  blocker: THREE.Box3 | null;
  /** Where it may stand nearest, when not where it is aimed (outlined in green: a click sets it down there). */
  suggestion: Pose | null;
  guides: readonly Guide[];
  /** Whether a cell of the footprint (world box) is taken. */
  taken: (cell: THREE.Box3) => boolean;
  /** The grid is shown (G turns it off: free placement). */
  grid: boolean;
  /** Set on a top (a table): the grid lies there, at this height (zone-local); null on the floor. */
  surfaceY: number | null;
}

/**
 * What the player sees while carrying a piece of furniture (docs/furnishing.md): the grid on its surface fading out
 * round it, its footprint cell by cell (green where it may stand, red where something is in the way), its outline
 * (green or red), a faint outline where it was taken from (E puts it back there), what blocks it outlined in red,
 * and the guides of what it lines up with. With free hands, the movable piece under the crosshair is outlined.
 * Drawn over the zone in the zone's frame, unlit, never casting nor catching a shadow.
 */
export class PlacementPreview {
  private readonly root = new THREE.Group();
  private readonly plane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly cells: THREE.InstancedMesh;
  private readonly outline = new BoxOutline(FREE, { depthTest: true });
  private readonly origin = new BoxOutline(0xffffff, { opacity: 0.35 });
  private readonly blocker = new BoxOutline(TAKEN, { opacity: 0.9 });
  private readonly hovered = new BoxOutline(HOVER_COLOR, { opacity: 0.55 });
  private readonly suggestion = new BoxOutline(FREE, { opacity: 0.8 });
  /** The ways through the doorways kept clear, faintly (the carried piece may not stand in them). */
  private readonly clearances: BoxOutline[] = [];
  private readonly guides: THREE.LineSegments;
  private surface: Surface = 'floor';
  private bounds = new THREE.Box3();
  private flatLift = 0;
  /** The last cells drawn, to redo them only when the target moves. */
  private cellsKey = '';
  private readonly toPlane = new THREE.Matrix4();
  private readonly toWorld = new THREE.Matrix4();

  constructor(scene: THREE.Object3D) {
    this.root.name = 'PlacementPreview';
    this.root.matrixAutoUpdate = false;
    this.root.visible = false;
    scene.add(this.root);

    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMaterial(CELL));
    this.plane.renderOrder = RENDER_ORDER.label;
    this.root.add(this.plane);

    const cellMaterial = onSurface(new THREE.MeshBasicMaterial({ transparent: true, opacity: CELL_OPACITY, depthWrite: false, toneMapped: false }), FLOOR.placement);
    this.cells = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), cellMaterial, MAX_CELLS);
    this.cells.count = 0;
    this.cells.frustumCulled = false;
    // Over the grid's lines (same layer, drawn after them).
    this.cells.renderOrder = RENDER_ORDER.label + 0.5;
    this.cells.setColorAt(0, FREE);
    this.plane.add(this.cells);

    const guideGeometry = new THREE.BufferGeometry();
    guideGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    this.guides = new THREE.LineSegments(guideGeometry, new THREE.LineBasicMaterial({ color: GUIDE_COLOR, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false }));
    this.guides.frustumCulled = false;
    this.guides.renderOrder = RENDER_ORDER.overlay;

    for (const part of [this.outline, this.origin, this.blocker, this.hovered, this.suggestion]) this.root.add(part.object);
    this.root.add(this.guides);
    for (const part of this.root.children) part.traverse((o) => void ((o.castShadow = false), (o.receiveShadow = false)));
  }

  /**
   * A piece of `surface` and local `bounds` was taken in `zone` from `start`: the grid laid out over its surface,
   * the `clearances` (world boxes: the doorways' ways through) outlined faintly.
   */
  show(zone: Zone, surface: Surface, bounds: THREE.Box3, start: Pose | null, clearances: readonly THREE.Box3[] = []): void {
    this.attach(zone);
    const toZone = new THREE.Matrix4().copy(zone.group.matrixWorld).invert();
    while (this.clearances.length < clearances.length) {
      const outline = new BoxOutline(TAKEN, { opacity: 0.3 });
      this.clearances.push(outline);
      this.root.add(outline.object);
    }
    this.clearances.forEach((outline, i) => {
      const box = clearances[i];
      outline.object.visible = box !== undefined;
      if (box) outline.setBox(box.clone().applyMatrix4(toZone));
    });
    this.surface = surface;
    this.bounds.copy(bounds);
    this.flatLift = bounds.max.y - bounds.min.y < 0.035 ? bounds.max.y : 0;
    this.cellsKey = '';
    if (start) this.origin.set(bounds, start);
    this.origin.object.visible = start !== null;
    this.hovered.object.visible = false;
    this.layPlane(zone.spec.extent, surface, start ?? { position: new THREE.Vector3(), yaw: 0 });
    this.root.visible = true;
  }

  /** Nothing carried: the grid and outlines go. */
  hide(): void {
    this.outline.object.visible = false;
    this.origin.object.visible = false;
    this.blocker.object.visible = false;
    this.suggestion.object.visible = false;
    for (const outline of this.clearances) outline.object.visible = false;
    this.plane.visible = false;
    this.guides.visible = false;
    this.cells.count = 0;
    this.root.visible = this.hovered.object.visible;
  }

  /** The movable piece under the crosshair (hands free), outlined at its pose; null: none. */
  hover(zone: Zone | null, bounds: THREE.Box3 | null, pose: Pose | null): void {
    const on = zone !== null && bounds !== null && pose !== null && !bounds.isEmpty();
    this.hovered.object.visible = on;
    if (on) {
      this.attach(zone);
      this.hovered.set(bounds, pose);
      this.root.visible = true;
    } else if (!this.plane.visible) this.root.visible = false;
  }

  update(zone: Zone, state: PreviewState): void {
    this.attach(zone);
    const extent = zone.spec.extent;
    this.outline.set(this.bounds, state.shown);
    this.outline.setColor(state.fits ? FREE : TAKEN);
    this.outline.object.visible = true;

    this.plane.visible = true;
    // The wall a picture is on can change: the plane follows it; on a table the grid lies on the table.
    if (this.surface === 'wall') this.layPlane(extent, 'wall', state.target);
    else if (this.surface === 'floor') {
      const y = state.surfaceY !== null ? state.surfaceY + FLOOR.placement.lift : Math.max(FLOOR.placement.lift, this.flatLift + 0.004);
      if (this.plane.position.y !== y) {
        this.plane.position.y = y;
        this.plane.updateMatrix();
        this.cellsKey = '';
      }
    }
    const material = this.plane.material;
    material.uniforms.uOpacity!.value = state.grid ? 0.32 : 0;
    this.toPlane.copy(this.plane.matrix).invert();
    const centre = turnedBounds(this.bounds, state.target.yaw).getCenter(new THREE.Vector3()).add(state.target.position).applyMatrix4(this.toPlane);
    (material.uniforms.uCentre!.value as THREE.Vector2).set(centre.x, centre.y);

    this.layCells(state);

    if (state.blocker && !state.fits) {
      const local = state.blocker.clone().applyMatrix4(new THREE.Matrix4().copy(zone.group.matrixWorld).invert());
      this.blocker.setBox(local);
      this.blocker.object.visible = true;
    } else this.blocker.object.visible = false;

    this.suggestion.object.visible = state.suggestion !== null && !state.fits;
    if (state.suggestion) this.suggestion.set(this.bounds, state.suggestion);

    const positions = this.guides.geometry.getAttribute('position') as THREE.BufferAttribute;
    state.guides.slice(0, 2).forEach((guide, i) => {
      positions.setXYZ(i * 2, guide.from.x, guide.from.y, guide.from.z);
      positions.setXYZ(i * 2 + 1, guide.to.x, guide.to.y, guide.to.z);
    });
    positions.needsUpdate = true;
    this.guides.geometry.setDrawRange(0, Math.min(state.guides.length, 2) * 2);
    this.guides.visible = state.guides.length > 0;
  }

  /** The preview drawn in `zone`'s frame. */
  private attach(zone: Zone): void {
    this.root.matrix.copy(zone.group.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
  }

  /** The grid's plane over the whole surface: the floor, the ceiling, or the wall `pose` hangs on (zone-local). */
  private layPlane(extent: Extent, surface: Surface, pose: Pose): void {
    const { width, depth, height } = extent;
    const plane = this.plane;
    plane.rotation.set(0, 0, 0);
    plane.position.set(0, 0, 0);
    let w = width;
    let h = depth;
    if (surface === 'floor') {
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = Math.max(FLOOR.placement.lift, this.flatLift + 0.004);
    } else if (surface === 'ceiling') {
      plane.rotation.x = Math.PI / 2;
      plane.position.y = height - WALL.placement.lift;
    } else {
      const normal = wallNormal(pose.yaw);
      plane.rotation.y = pose.yaw;
      plane.position.set(-normal.x * (width / 2 - WALL.placement.lift), height / 2, -normal.z * (depth / 2 - WALL.placement.lift));
      w = normal.x !== 0 ? depth : width;
      h = height;
    }
    // Built in metres (never scaled): the shader reads the plane's local position as metres on the surface.
    const size = plane.geometry.parameters;
    if (size.width !== w || size.height !== h) {
      plane.geometry.dispose();
      plane.geometry = new THREE.PlaneGeometry(w, h);
    }
    plane.updateMatrix();
    this.toPlane.copy(plane.matrix).invert();
    // The grid's lines, counted from the room's back-left corner at floor level (the grid of `grid.ts`).
    const corner = new THREE.Vector3(-width / 2 + 0.005, 0, -depth / 2 + 0.005).applyMatrix4(this.toPlane);
    (plane.material.uniforms.uOrigin!.value as THREE.Vector2).set(corner.x, corner.y);
  }

  /** The footprint, cell by cell on the grid, coloured by what stands there (redone when the target moves). */
  private layCells(state: PreviewState): void {
    const { target } = state;
    // To the centimetre: off the grid the aim moves every frame, the cells need not follow each hair.
    const key = `${target.position.x.toFixed(2)},${target.position.y.toFixed(2)},${target.position.z.toFixed(2)},${target.yaw.toFixed(2)},${state.fits}`;
    if (key === this.cellsKey) return;
    this.cellsKey = key;
    const box = turnedBounds(this.bounds, target.yaw).translate(target.position);
    const wall = this.surface === 'wall';
    const normal = wall ? wallNormal(target.yaw) : null;
    // The two axes the cells run along (zone-local), and the third (through the surface) the cell's box spans whole.
    const [u, v] = wall ? (normal!.x !== 0 ? (['z', 'y'] as const) : (['x', 'y'] as const)) : (['x', 'z'] as const);
    let size = CELL;
    const count = (s: number) => Math.ceil((box.max[u] - box.min[u]) / s - 1e-6) * Math.ceil((box.max[v] - box.min[v]) / s - 1e-6);
    while (count(size) > MAX_CELLS) size *= 2;
    const cell = new THREE.Box3();
    const at = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const toWorld = this.toWorld.copy(this.root.matrix);
    let n = 0;
    for (let a = box.min[u]; a < box.max[u] - 1e-6; a += size) {
      for (let b = box.min[v]; b < box.max[v] - 1e-6; b += size) {
        const a1 = Math.min(a + size, box.max[u]);
        const b1 = Math.min(b + size, box.max[v]);
        cell.copy(box);
        cell.min[u] = a;
        cell.max[u] = a1;
        cell.min[v] = b;
        cell.max[v] = b1;
        const taken = state.taken(cell.clone().applyMatrix4(toWorld));
        // The cell's centre on the surface, in the plane's frame.
        cell.getCenter(at);
        if (!wall) at.y = 0;
        at.applyMatrix4(this.toPlane);
        at.z = 0.001;
        scale.set((a1 - a) * 0.9, (b1 - b) * 0.9, 1);
        matrix.compose(at, new THREE.Quaternion(), scale);
        this.cells.setMatrixAt(n, matrix);
        this.cells.setColorAt(n, taken ? TAKEN : FREE);
        n++;
      }
    }
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
  }
}

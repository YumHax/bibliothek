/*
 * The props: decoration and small furniture. Built by `layout.ts` from `roomPlan.ts`; the kinds the
 * plan can list by name live in `decor.ts`.
 */
export type { SkyState } from './DayNight';
export { DayNight } from './DayNight';
export { Outdoors } from './outdoors/Outdoors';
export { RoomWindow } from './Window';
export { Curtains } from './Curtains';
export { Poster } from './Poster';
export { Rug } from './Rug';
export { ConsoleStand } from './ConsoleStand';
export { Console, type PlatformSelectHandler } from './Console';
export { Plant } from './Plant';
export { PendantLamp } from './PendantLamp';
export { FloorLamp } from './FloorLamp';
export { ShelfLamp } from './ShelfLamp';
export { PictureFrame } from './PictureFrame';
export { SideTable } from './SideTable';
export { Cushion } from './Cushion';
export { WallClock } from './WallClock';
export { Door } from './Door';
export { DECOR_KINDS, placeDecor, buildDecor, type DecorEntry, type DecorKind } from './decor';

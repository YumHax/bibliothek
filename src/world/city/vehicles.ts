/**
 * The neighbourhood's vehicles at real scale, in metres: overall length nose to tail, width, height
 * to the roof (a lorry's: to the top of its body) and wheel radius. The one set of sizes both
 * pictures of the street are built to: the walkable street's 3D models (`street/carModel.ts`) and
 * the boxes the window view paints (`props/outdoors/Car.ts`).
 */
interface VehicleDimensions {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly wheelRadius: number;
}

export const VEHICLES = {
  /** A small hatchback, the commonest car on the street. */
  car: { length: 4.2, width: 1.74, height: 1.46, wheelRadius: 0.32 },
  /** A saloon with a boot. */
  saloon: { length: 4.65, width: 1.8, height: 1.44, wheelRadius: 0.33 },
  /** A small panel van: parked, and the delivery van of the mornings. */
  van: { length: 4.9, width: 1.95, height: 2.3, wheelRadius: 0.34 },
  /** The city bus (line 38). */
  bus: { length: 12, width: 2.5, height: 3.1, wheelRadius: 0.5 },
  /** The bin lorry (the window view's dustcart): cab in front of the tall compactor body. */
  lorry: { length: 9, width: 2.5, height: 3.4, wheelRadius: 0.5 },
} as const satisfies Record<string, VehicleDimensions>;

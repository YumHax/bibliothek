import * as THREE from 'three';

/** The white a neutral look keeps (K): sRGB's D65, as the Planckian locus has it, so temperature 0 is the identity. */
const NEUTRAL_KELVIN = 6504;
/** Mireds (1e6 / K) of white-point shift per unit of `Look.temperature`: +1 is about 4700 K, -1 about 10600 K. */
const MIREDS_PER_UNIT = 60;

/** CIE 1931 xy of a black body at `kelvin` (Kim et al.'s cubic fit of the Planckian locus, 1667 .. 25000 K). */
export function planckianXy(kelvin: number): [x: number, y: number] {
  const t = THREE.MathUtils.clamp(kelvin, 1667, 25000);
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

const RGB_TO_XYZ = new THREE.Matrix3().set(0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041);
const XYZ_TO_RGB = RGB_TO_XYZ.clone().invert();
/** Bradford's cone response (the usual von Kries space for a white-point change). */
const BRADFORD = new THREE.Matrix3().set(0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296);
const BRADFORD_INVERSE = BRADFORD.clone().invert();

function coneWhite(kelvin: number): THREE.Vector3 {
  const [x, y] = planckianXy(kelvin);
  return new THREE.Vector3(x / y, 1, (1 - x - y) / y).applyMatrix3(BRADFORD);
}

const neutralCones = coneWhite(NEUTRAL_KELVIN);
const gains = new THREE.Matrix3();
const grey = new THREE.Vector3();

/**
 * The white balance of `temperature` (`Look.temperature`, -1 cool .. +1 warm) as a linear-sRGB
 * matrix, into `out`: a von Kries adaptation (Bradford) taking the neutral white to one
 * `MIREDS_PER_UNIT` mireds warmer per unit, scaled so a grey keeps its luminance. Applied to the HDR
 * frame before tone mapping (`PostFx`), where a lamp's highlight and a shadow shift alike.
 */
export function whiteBalance(temperature: number, out: THREE.Matrix3): THREE.Matrix3 {
  if (Math.abs(temperature) < 1e-4) return out.identity();
  const mireds = THREE.MathUtils.clamp(1e6 / NEUTRAL_KELVIN + MIREDS_PER_UNIT * temperature, 40, 600);
  const cones = coneWhite(1e6 / mireds);
  gains.set(cones.x / neutralCones.x, 0, 0, 0, cones.y / neutralCones.y, 0, 0, 0, cones.z / neutralCones.z);
  out.copy(XYZ_TO_RGB).multiply(BRADFORD_INVERSE).multiply(gains).multiply(BRADFORD).multiply(RGB_TO_XYZ);
  const luma = grey.set(1, 1, 1).applyMatrix3(out).dot(new THREE.Vector3(0.2126, 0.7152, 0.0722));
  return out.multiplyScalar(1 / Math.max(luma, 1e-3));
}

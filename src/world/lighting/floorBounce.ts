import * as THREE from 'three';

/** Share of the light reaching the floor that its colour sends back up to the room (the rest is the walls' white, the hemisphere's sky). */
const BOUNCE = 0.6;
/** How far the bounce's colour is pulled towards a grey of the same luminance: the walls and ceiling mix the floor's hue down. */
const MIX_DOWN = 0.3;
/** Side of the canvas a floor's map is averaged on. */
const SAMPLE_PX = 8;

/**
 * The hemisphere ground colour a floor gives a room: its albedo (the material's colour times the
 * average of its colour map, in linear) times `BOUNCE`, a little desaturated. An oak parquet
 * bounces a warm brown, a white tiled floor a pale grey, the arcade's black carpet almost nothing.
 * `fallback` (a hex, sRGB) when the map cannot be read (not a canvas or image yet).
 */
export function floorBounce(material: THREE.MeshStandardMaterial, fallback: THREE.ColorRepresentation, out = new THREE.Color()): THREE.Color {
  const average = mapAverage(material.map);
  if (!average) return out.set(fallback);
  out.copy(material.color).multiply(average).multiplyScalar(BOUNCE);
  const luma = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
  return out.lerp(new THREE.Color(luma, luma, luma), MIX_DOWN);
}

/** The linear average colour of a canvas or image texture, or null. */
function mapAverage(map: THREE.Texture | null): THREE.Color | null {
  const image = map?.image as CanvasImageSource | undefined;
  if (!image || !(image instanceof HTMLCanvasElement || image instanceof HTMLImageElement || image instanceof ImageBitmap)) return null;
  if (image instanceof HTMLImageElement && !image.complete) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  try {
    ctx.drawImage(image, 0, 0, SAMPLE_PX, SAMPLE_PX);
    const data = ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data;
    const sum = new THREE.Color(0, 0, 0);
    const texel = new THREE.Color();
    for (let i = 0; i < data.length; i += 4) {
      // The map's texels are sRGB: averaged as light, in linear.
      texel.setRGB(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255, THREE.SRGBColorSpace);
      sum.add(texel);
    }
    return sum.multiplyScalar(1 / (SAMPLE_PX * SAMPLE_PX));
  } catch {
    return null;
  }
}

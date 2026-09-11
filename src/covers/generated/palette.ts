import * as THREE from 'three';

/**
 * Picks a representative, reasonably saturated colour from an image by sampling it at low
 * resolution. Falls back to `fallback` for tainted canvases or blank images.
 */
export function dominantColor(image: CanvasImageSource, fallback: THREE.Color): THREE.Color {
  try {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let r = 0, g = 0, b = 0, weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [pr, pg, pb, pa] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (pa < 128) continue;
      const max = Math.max(pr, pg, pb);
      const min = Math.min(pr, pg, pb);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = max / 255;
      // Favour colourful mid-tones; near-black and near-white pixels barely count.
      const w = 0.05 + saturation * brightness * (1 - Math.abs(brightness - 0.55));
      r += pr * w; g += pg * w; b += pb * w; weight += w;
    }
    if (weight === 0) return fallback.clone();
    return new THREE.Color(r / weight / 255, g / weight / 255, b / weight / 255);
  } catch {
    return fallback.clone();
  }
}

export function css(color: THREE.Color): string {
  return `#${color.getHexString()}`;
}

/** Text colour (black or white) that reads on top of `bg`. */
export function contrastText(bg: THREE.Color): string {
  const lum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
  return lum > 0.5 ? '#111111' : '#f5f5f5';
}

/** A framing guide, and the part of the view a photo taken with it keeps. */
export interface PhotoFrame {
  id: 'none' | 'thirds' | 'letterbox' | 'square';
  name: string;
  /** Width over height of what is kept, or null: the whole view. */
  aspect: number | null;
}

export const PHOTO_FRAMES: readonly PhotoFrame[] = [
  { id: 'none', name: 'No guides', aspect: null },
  { id: 'thirds', name: 'Rule of thirds', aspect: null },
  { id: 'letterbox', name: 'Cinema 2.39 : 1', aspect: 2.39 },
  { id: 'square', name: 'Square', aspect: 1 },
];

/** The centred rectangle of a `width` x `height` view that `frame` keeps (whole pixels). */
export function cropOf(frame: PhotoFrame, width: number, height: number): { x: number; y: number; w: number; h: number } {
  if (!frame.aspect) return { x: 0, y: 0, w: width, h: height };
  const w = Math.min(width, Math.round(height * frame.aspect));
  const h = Math.min(height, Math.round(w / frame.aspect));
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), w, h };
}

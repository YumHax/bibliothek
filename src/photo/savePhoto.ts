/** How a save went: the file's name, or why there is none. */
type PhotoSaved = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Hands `canvas` to the browser as a PNG download, named by the date and time
 * ("bibliothek-2026-09-25-18h42m07.png"); `done` hears how it went (a canvas the browser would not
 * encode, or a download it blocked).
 */
export function savePhoto(canvas: HTMLCanvasElement, done: (result: PhotoSaved) => void = () => {}, now: Date = new Date()): void {
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `bibliothek-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}.png`;
  try {
    canvas.toBlob((blob) => {
      if (!blob) {
        done({ ok: false, reason: 'The browser could not make the picture (the frame may be too large).' });
        return;
      }
      try {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        done({ ok: true, name });
      } catch {
        done({ ok: false, reason: 'The browser blocked the download.' });
      }
    }, 'image/png');
  } catch {
    done({ ok: false, reason: 'The browser would not save this frame.' });
  }
}

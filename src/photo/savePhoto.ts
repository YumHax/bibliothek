/** Hands `canvas` to the browser as a PNG download, named by the date and time ("bibliothek-2026-09-25-18h42m07.png"). */
export function savePhoto(canvas: HTMLCanvasElement, now: Date = new Date()): void {
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `bibliothek-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}.png`;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, 'image/png');
}

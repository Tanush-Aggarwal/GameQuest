// How an administrator framed a header picture: the focus point (percent from the left / top) and a zoom, applied the
// same way in the header and in the editor's preview so what they see is what everyone gets.
export function heroFrameStyle(frame) {
  if (!frame) return undefined;
  const x = Number.isFinite(frame.posX) ? frame.posX : 50;
  const y = Number.isFinite(frame.posY) ? frame.posY : 30;
  const zoom = Number.isFinite(frame.zoom) ? frame.zoom : 1;
  return { objectPosition: `${x}% ${y}%`, transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: `${x}% ${y}%` };
}

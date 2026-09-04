// A missing monitor must never silently replace the user's saved choice.
export function resolveDisplay(displays, settings) {
  const exact = displays.find(d => d.id === settings.displayId);
  if (exact) return exact;
  const label = settings.displayIdentity?.label;
  if (!label) return null;
  const matches = displays.filter(d => d.label === label);
  if (matches.length === 1) return matches[0];
  return null; // Identical monitor models are ambiguous; wait for the saved ID.
}
export function rememberDisplay(display) {
  return { label: display.label || '', width: display.size.width, height: display.size.height };
}
export function boundsForDisplay(display, overlay = false) {
  const area = display.workArea;
  if (overlay) return { x: area.x + Math.max(0, area.width - 552), y: area.y + 16, width: Math.min(536, area.width), height: Math.min(830, area.height - 32) };
  return { x: area.x, y: area.y, width: Math.min(1600, area.width), height: Math.min(960, area.height) };
}

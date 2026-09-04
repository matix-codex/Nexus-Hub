import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDisplay, rememberDisplay, boundsForDisplay } from '../electron/displays.mjs';
const monitor = (id, label, x = 0) => ({ id, label, size: { width: 1920, height: 1080 }, workArea: { x, y: 0, width: 1920, height: 1040 } });
test('Saved display never falls back to a different monitor after disconnection', () => {
  const primary = monitor(1, 'Main'), second = monitor(2, 'Cockpit', 1920);
  const settings = { displayId: second.id, displayIdentity: rememberDisplay(second) };
  assert.equal(resolveDisplay([primary, second], settings), second);
  assert.equal(resolveDisplay([primary], settings), null);
  assert.equal(settings.displayId, 2);
  assert.equal(resolveDisplay([second, primary], settings), second);
});
test('OS id changes can recover a unique monitor name, never an ambiguous match', () => {
  const settings = { displayId: 2, displayIdentity: { label: 'Cockpit' } };
  const reconnected = monitor(99, 'Cockpit');
  assert.equal(resolveDisplay([monitor(1, 'Main'), reconnected], settings), reconnected);
  assert.equal(resolveDisplay([reconnected, monitor(100, 'Cockpit')], settings), null);
});
test('Fullscreen and overlay both anchor to the chosen monitor work area', () => {
  const display = monitor(2, 'Cockpit', -1920);
  const normal = boundsForDisplay(display), overlay = boundsForDisplay(display, true);
  assert.equal(normal.x, -1920);
  for (const bounds of [normal, overlay]) {
    assert.ok(bounds.x >= display.workArea.x);
    assert.ok(bounds.x + bounds.width <= display.workArea.x + display.workArea.width);
  }
});

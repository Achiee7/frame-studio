import { useState } from 'react';

const themes = { blue: 'Blueprint', violet: 'Violet', teal: 'Teal', amber: 'Amber', slate: 'Slate' };
type Theme = keyof typeof themes;
type Mode = 'light' | 'dark' | 'system';
const key = 'frame-studio.appearance';
const system = window.matchMedia('(prefers-color-scheme: dark)');
let theme: Theme = 'blue';
let mode: Mode = 'system';
try {
  const saved = JSON.parse(localStorage.getItem(key) || 'null');
  if (saved && Object.hasOwn(themes, saved.theme)) theme = saved.theme;
  if (saved && ['light', 'dark', 'system'].includes(saved.mode)) mode = saved.mode;
} catch { /* Use the defaults when storage is unavailable. */ }
function apply() {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
}
apply();
system.addEventListener('change', apply);

export function AppearanceSettings() {
  const [selection, setSelection] = useState({theme, mode});
  function update(nextTheme: Theme, nextMode: Mode) {
    theme = nextTheme;
    mode = nextMode;
    apply();
    setSelection({theme, mode});
    try { localStorage.setItem(key, JSON.stringify({theme, mode})); } catch { /* Session choice still applies. */ }
  }
  return <fieldset className="appearance-settings"><legend>Appearance</legend>
    <label>Theme<select value={selection.theme} onChange={e => update(e.target.value as Theme, mode)}>
      {Object.entries(themes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label>Mode<select value={selection.mode} onChange={e => update(theme, e.target.value as Mode)}>
      <option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option>
    </select></label>
  </fieldset>;
}

/**
 * modes.js – Context-aware mode switching
 * Source: bluetooth.modes section of Bluetooth Monaco config
 */

const Modes = (() => {
  const MODES = ['global', 'editor', 'sidebar', 'terminal', 'chat', 'dialog'];
  let currentMode = 'global';
  const listeners = [];

  const SWITCH_RULES = [
    { trigger: 'focus:monaco-editor',  mode: 'editor'   },
    { trigger: 'focus:sidebar',        mode: 'sidebar'  },
    { trigger: 'focus:terminal',       mode: 'terminal' },
    { trigger: 'focus:chat-input',     mode: 'chat'     },
    { trigger: 'dialog:open',          mode: 'dialog'   },
  ];

  function setMode(mode) {
    if (!MODES.includes(mode)) return;
    if (mode === currentMode) return;
    currentMode = mode;
    _updateIndicator();
    listeners.forEach(fn => fn(currentMode));
  }

  function getMode() { return currentMode; }

  function _updateIndicator() {
    const el = document.getElementById('controller-mode-indicator');
    if (el) el.textContent = 'MODE: ' + currentMode;
  }

  function onChange(fn) { listeners.push(fn); }

  /** Call with a trigger string, e.g. "focus:monaco-editor" */
  function trigger(triggerStr) {
    const rule = SWITCH_RULES.find(r => r.trigger === triggerStr);
    if (rule) setMode(rule.mode);
  }

  /** Wire up DOM focus events for automatic mode switching */
  function init() {
    const editor = document.getElementById('monaco-editor');
    const sidebar = document.getElementById('sidebar');
    const terminalInput = document.getElementById('terminal-input');
    const chatInput = document.getElementById('chat-input');

    if (editor)        editor.addEventListener('focusin',   () => trigger('focus:monaco-editor'));
    if (sidebar)       sidebar.addEventListener('focusin',  () => trigger('focus:sidebar'));
    if (terminalInput) terminalInput.addEventListener('focus', () => trigger('focus:terminal'));
    if (chatInput)     chatInput.addEventListener('focus',     () => trigger('focus:chat-input'));

    document.addEventListener('focusin', (e) => {
      if (editor && editor.contains(e.target))        trigger('focus:monaco-editor');
      else if (sidebar && sidebar.contains(e.target)) trigger('focus:sidebar');
    });

    _updateIndicator();
  }

  return { init, setMode, getMode, onChange, trigger, MODES };
})();

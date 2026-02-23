/**
 * modes.js – Context-aware mode switching
 * Source: bluetooth.modes in Bluetooth Monaco config
 *
 * Tracks which part of the IDE has focus and sets the active
 * controller-input mode accordingly. Other modules call
 * Modes.getMode() to decide how to handle a button press.
 */

const Modes = (() => {
  const ALL_MODES = ['global', 'editor', 'sidebar', 'terminal', 'chat', 'dialog'];
  let _current = 'global';
  const _listeners = [];

  const SWITCH_RULES = [
    { trigger: 'focus:monaco-editor', mode: 'editor'   },
    { trigger: 'focus:sidebar',       mode: 'sidebar'  },
    { trigger: 'focus:terminal',      mode: 'terminal' },
    { trigger: 'focus:chat-input',    mode: 'chat'     },
    { trigger: 'dialog:open',         mode: 'dialog'   },
  ];

  function setMode(mode) {
    if (!ALL_MODES.includes(mode) || mode === _current) return;
    _current = mode;
    _updateIndicator();
    _listeners.forEach(fn => fn(_current));
  }

  function getMode() { return _current; }

  function _updateIndicator() {
    // Update any element with id="controller-mode-indicator" that the host IDE provides
    const el = document.getElementById('controller-mode-indicator');
    if (el) el.textContent = 'MODE: ' + _current;
  }

  /** Register a callback invoked whenever the mode changes. */
  function onChange(fn) { _listeners.push(fn); }

  /** Fire a named trigger string, e.g. "focus:monaco-editor". */
  function trigger(triggerStr) {
    const rule = SWITCH_RULES.find(r => r.trigger === triggerStr);
    if (rule) setMode(rule.mode);
  }

  /**
   * Attach automatic mode switching to host IDE DOM elements.
   * Pass the elements you want to monitor; all are optional.
   *
   * @param {{ editor?, sidebar?, terminal?, chatInput? }} elements
   */
  function init({ editor, sidebar, terminal, chatInput } = {}) {
    if (editor)    editor.addEventListener('focusin',    () => trigger('focus:monaco-editor'));
    if (sidebar)   sidebar.addEventListener('focusin',   () => trigger('focus:sidebar'));
    if (terminal)  terminal.addEventListener('focusin',  () => trigger('focus:terminal'));
    if (chatInput) chatInput.addEventListener('focus',   () => trigger('focus:chat-input'));
    _updateIndicator();
  }

  return { init, setMode, getMode, onChange, trigger, ALL_MODES };
})();

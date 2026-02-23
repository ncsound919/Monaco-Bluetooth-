/**
 * controller.js – Gamepad API handler
 * Source: bluetooth.buttonMappings & bluetooth.inputPolling in Bluetooth Monaco config
 *
 * Polls the Gamepad API and translates button/axis events into Monaco
 * editor commands using the unified PlayStation / Xbox button layout
 * defined in the config. All editor commands are dispatched via the
 * monaco editor action system so they work identically to keyboard shortcuts.
 */

const ControllerHandler = (() => {
  // ── Config (mirrors Bluetooth Monaco JSON) ───────────────
  const DEADZONE_ANALOG   = 0.12;
  const DEADZONE_TRIGGER  = 0.05;
  const REPEAT_INITIAL_MS = 400;
  const REPEAT_MS         = 80;
  const POLL_HZ           = 60;

  /**
   * Unified button index → name mapping (PlayStation / Xbox).
   * Indices match the standard Gamepad API layout.
   */
  const BUTTON_NAMES = {
    0:  'Cross_A',        // Cross / A
    1:  'Circle_B',       // Circle / B
    2:  'Square_X',       // Square / X
    3:  'Triangle_Y',     // Triangle / Y
    4:  'L1_LB',          // L1 / LB
    5:  'R1_RB',          // R1 / RB
    6:  'L2_LT',          // L2 / LT (digital)
    7:  'R2_RT',          // R2 / RT (digital)
    8:  'Select_Back',    // Share / View
    9:  'Start_Options',  // Options / Menu
    10: 'L3',             // L3 / LS
    11: 'R3',             // R3 / RS
    12: 'DPad_Up',
    13: 'DPad_Down',
    14: 'DPad_Left',
    15: 'DPad_Right',
  };

  /**
   * Action map keyed by mode → combo → Monaco action ID (or custom fn key).
   * Combos use "+" separators with modifier first, e.g. "L1_LB+DPad_Left".
   */
  const ACTION_MAP = {
    global: {
      'Select_Back':                { action: 'actions.find',                   label: 'Quick Open'       },
      'Start_Options':              { action: 'workbench.action.showCommands',   label: 'Command Palette'  },
      'L1_LB+DPad_Left':            { action: 'workbench.view.explorer',         label: 'Focus Sidebar'    },
      'L1_LB+DPad_Right':           { action: 'workbench.action.focusFirstEditorGroup', label: 'Focus Editor' },
      'R1_RB+DPad_Down':            { action: 'workbench.action.terminal.focus', label: 'Focus Terminal'   },
    },
    editor: {
      // Cursor movement
      'L1_LB+DPad_Left':            { action: 'cursorWordLeft',         label: 'Word Left'        },
      'L1_LB+DPad_Right':           { action: 'cursorWordRight',        label: 'Word Right'       },
      'L1_LB+DPad_Up':              { action: 'cursorHome',             label: 'Line Start'       },
      'L1_LB+DPad_Down':            { action: 'cursorEnd',              label: 'Line End'         },
      // Selection
      'Cross_A+Cross_A':            { action: 'editor.action.selectHighlights', label: 'Select Word' },
      'R1_RB+Cross_A':              { action: 'expandLineSelection',    label: 'Select Line'      },
      'L2_LT+R2_RT':                { action: 'editor.action.selectAll', label: 'Select All'      },
      // Editing
      'L1_LB+Square_X':             { action: 'editor.action.clipboardCopyAction',  label: 'Copy'   },
      'L1_LB+Triangle_Y':           { action: 'editor.action.clipboardCutAction',   label: 'Cut'    },
      'L1_LB+Circle_B':             { action: 'editor.action.clipboardPasteAction', label: 'Paste'  },
      'L2_LT+Square_X':             { action: 'undo',                   label: 'Undo'             },
      'L2_LT+Triangle_Y':           { action: 'redo',                   label: 'Redo'             },
      'L2_LT+Circle_B':             { action: 'workbench.action.files.save', label: 'Save'         },
      'L2_LT+Cross_A':              { action: 'workbench.action.files.saveAll', label: 'Save All'  },
      'R2_RT+Triangle_Y':           { action: 'editor.action.formatDocument', label: 'Format'      },
      'R2_RT+Square_X':             { action: 'editor.action.commentLine',    label: 'Toggle Comment' },
      'R2_RT+Circle_B':             { action: 'tab',                    label: 'Indent'           },
      'R2_RT+Cross_A':              { action: 'outdent',                label: 'Outdent'          },
      // Navigation
      'R3':                         { action: 'editor.action.revealDefinition', label: 'Go to Definition' },
      'L3+Square_X':                { action: 'actions.find',           label: 'Find'             },
      'L3+Triangle_Y':              { action: 'editor.action.startFindReplaceAction', label: 'Replace' },
      'L3+Circle_B':                { action: 'workbench.action.gotoLine', label: 'Go to Line'    },
      'L3+Cross_A':                 { action: 'editor.action.peekDefinition', label: 'Peek Definition' },
      'R1_RB+R2_RT':                { action: 'editor.action.marker.next', label: 'Next Error'    },
      'L1_LB+L2_LT':                { action: 'editor.action.marker.prev', label: 'Prev Error'    },
      // IntelliSense
      'Triangle_Y':                 { action: 'editor.action.triggerSuggest', label: 'Trigger Suggest' },
    },
    tabs: {
      'R2_RT':                      { action: 'workbench.action.nextEditor',        label: 'Next Tab'    },
      'L2_LT':                      { action: 'workbench.action.previousEditor',    label: 'Prev Tab'    },
      'Circle_B':                   { action: 'workbench.action.closeActiveEditor', label: 'Close Tab'   },
      'R1_RB+DPad_Left':            { action: 'workbench.action.moveEditorLeftInGroup',  label: 'Move Tab Left'  },
      'R1_RB+DPad_Right':           { action: 'workbench.action.moveEditorRightInGroup', label: 'Move Tab Right' },
    },
    sidebar: {
      'R1_RB+Square_X':             { action: 'explorer.newFile',        label: 'New File'   },
      'R1_RB+Triangle_Y':           { action: 'explorer.newFolder',      label: 'New Folder' },
      'R1_RB+R2_RT':                { action: 'workbench.files.action.refreshFilesExplorer', label: 'Refresh' },
    },
    terminal: {
      'R1_RB+R2_RT':                { action: 'workbench.action.terminal.toggleTerminal', label: 'Toggle Terminal' },
      'L1_LB+Square_X':             { action: 'workbench.action.terminal.new',            label: 'New Terminal'    },
      'L1_LB+Triangle_Y':           { action: 'workbench.action.terminal.clear',          label: 'Clear Terminal'  },
      'L1_LB+Circle_B':             { action: 'workbench.action.terminal.kill',           label: 'Close Terminal'  },
    },
    activityBar: {
      'L1_LB+Square_X':             { action: 'workbench.view.explorer',         label: 'Explorer'       },
      'L1_LB+Triangle_Y':           { action: 'workbench.view.search',           label: 'Search'         },
      'L1_LB+Circle_B':             { action: 'workbench.view.scm',              label: 'Source Control' },
      'L1_LB+Cross_A':              { action: 'workbench.view.extensions',       label: 'Extensions'     },
    },
  };

  // ── State ────────────────────────────────────────────────
  let _editor         = null;   // monaco.editor.IStandaloneCodeEditor
  let _monacoNS       = null;   // the monaco namespace
  let _pollHandle     = null;
  let _held           = new Set();
  let _lastPressed    = new Set();
  let _repeatTimers   = {};
  const _customActions = {};

  // ── Public API ───────────────────────────────────────────

  /**
   * Attach to a Monaco editor instance.
   * @param {object} editor - monaco.editor.IStandaloneCodeEditor
   * @param {object} monacoNS - the `monaco` namespace object
   */
  function init(editor, monacoNS) {
    _editor   = editor;
    _monacoNS = monacoNS;
    window.addEventListener('gamepadconnected',    _onGamepadConnected);
    window.addEventListener('gamepaddisconnected', _onGamepadDisconnected);
    _startPolling();
  }

  /**
   * Register a custom handler for a combo in a given mode.
   * Overrides the built-in ACTION_MAP entry for that combo.
   * @param {string} mode   - e.g. "editor"
   * @param {string} combo  - e.g. "L1_LB+Square_X"
   * @param {function} fn   - called with no arguments when triggered
   */
  function registerAction(mode, combo, fn) {
    if (!_customActions[mode]) _customActions[mode] = {};
    _customActions[mode][combo] = fn;
  }

  function destroy() {
    window.removeEventListener('gamepadconnected',    _onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', _onGamepadDisconnected);
    _stopPolling();
  }

  // ── Private helpers ──────────────────────────────────────

  function _onGamepadConnected(e) {
    console.log('[Controller] Connected:', e.gamepad.id);
    _startPolling();
  }
  function _onGamepadDisconnected(e) {
    console.log('[Controller] Disconnected:', e.gamepad.id);
  }

  function _startPolling() {
    if (_pollHandle) return;
    const interval = Math.round(1000 / POLL_HZ);
    _pollHandle = setInterval(_poll, interval);
  }
  function _stopPolling() {
    clearInterval(_pollHandle);
    _pollHandle = null;
  }

  function _poll() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gamepads) {
      if (!gp) continue;
      _processButtons(gp);
      _processAxes(gp);
    }
  }

  function _processButtons(gp) {
    const currentlyHeld = new Set();

    gp.buttons.forEach((btn, idx) => {
      if (btn.pressed) currentlyHeld.add(idx);
    });

    // Detect newly-pressed buttons (not held on the previous frame)
    currentlyHeld.forEach(idx => {
      if (!_lastPressed.has(idx)) {
        _onButtonDown(idx, currentlyHeld);
      }
    });

    // Detect released buttons
    _lastPressed.forEach(idx => {
      if (!currentlyHeld.has(idx)) {
        _onButtonUp(idx);
      }
    });

    _lastPressed = currentlyHeld;
    _held        = currentlyHeld;
  }

  function _onButtonDown(idx, allHeld) {
    const combo = _buildCombo(idx, allHeld);
    _dispatch(combo);
    // Key-repeat
    _repeatTimers[idx] = setTimeout(() => {
      // If the button is no longer held when the initial delay elapses,
      // do not start the repeat interval.
      if (!_held.has(idx)) {
        clearTimeout(_repeatTimers[idx]);
        delete _repeatTimers[idx];
        return;
      }
      _repeatTimers[idx] = setInterval(() => {
        if (_held.has(idx)) {
          _dispatch(combo);
        } else {
          clearInterval(_repeatTimers[idx]);
          delete _repeatTimers[idx];
        }
      }, REPEAT_MS);
    }, REPEAT_INITIAL_MS);
  }

  function _onButtonUp(idx) {
    const t = _repeatTimers[idx];
    if (t) { clearTimeout(t); clearInterval(t); delete _repeatTimers[idx]; }
  }

  /** Build a combo string for the pressed button plus any held modifiers. */
  function _buildCombo(pressedIdx, allHeld) {
    const MODIFIER_INDICES = [4, 5, 6, 7, 10, 11]; // L1,R1,L2,R2,L3,R3
    const parts = [];
    MODIFIER_INDICES.forEach(m => {
      if (m !== pressedIdx && allHeld.has(m)) parts.push(BUTTON_NAMES[m]);
    });
    parts.push(BUTTON_NAMES[pressedIdx] || `btn${pressedIdx}`);
    return parts.join('+');
  }

  function _dispatch(combo) {
    const mode = (typeof Modes !== 'undefined') ? Modes.getMode() : 'global';

    // Check custom overrides first
    const customFn = _customActions[mode]?.[combo] || _customActions['global']?.[combo];
    if (customFn) { customFn(); return; }

    // Look up built-in map (mode → tabs → global fallback)
    const entry = ACTION_MAP[mode]?.[combo]
               || ACTION_MAP['tabs']?.[combo]
               || ACTION_MAP['global']?.[combo];
    if (!entry || !_editor) return;

    try {
      _editor.trigger('controller', entry.action, null);
    } catch (e) {
      console.warn('[Controller] trigger failed for', entry.action, e);
    }
  }

  /** Analog stick / trigger axis processing. */
  function _processAxes(gp) {
    if (!_editor) return;
    const [lx, ly, rx, ry] = gp.axes;

    // Left stick → cursor movement
    if (Math.abs(lx) > DEADZONE_ANALOG || Math.abs(ly) > DEADZONE_ANALOG) {
      _moveCursorByAnalog(lx, ly);
    }

    // Right stick → scroll
    if (Math.abs(rx) > DEADZONE_ANALOG || Math.abs(ry) > DEADZONE_ANALOG) {
      const speed = _held.has(6) ? 3 : 1; // L2 held → fast scroll
      _editor.setScrollPosition({
        scrollLeft: _editor.getScrollLeft() + rx * 8 * speed,
        scrollTop:  _editor.getScrollTop()  + ry * 8 * speed,
      });
    }
  }

  function _moveCursorByAnalog(x, y) {
    const pos    = _editor.getPosition();
    if (!pos) return;
    const model  = _editor.getModel();
    if (!model) return;
    const newLine = Math.max(1, Math.min(model.getLineCount(), pos.lineNumber + Math.round(y)));
    const newCol  = Math.max(1, pos.column + Math.round(x));
    _editor.setPosition({ lineNumber: newLine, column: newCol });
    _editor.revealPositionInCenterIfOutsideViewport({ lineNumber: newLine, column: newCol });
  }

  return { init, destroy, registerAction, BUTTON_NAMES, ACTION_MAP };
})();

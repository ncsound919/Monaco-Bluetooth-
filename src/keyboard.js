/**
 * keyboard.js – On-screen QWERTY keyboard overlay
 * Source: bluetooth.onScreenKeyboard in Bluetooth Monaco config
 *
 * Renders a floating keyboard controlled by the D-Pad + buttons.
 * Call OnScreenKeyboard.show(targetInput) to open it and
 * OnScreenKeyboard.hide() to dismiss it.
 */

const OnScreenKeyboard = (() => {
  // QWERTY layout rows
  const ROWS = [
    ['`','1','2','3','4','5','6','7','8','9','0','-','=','⌫'],
    ['Tab','q','w','e','r','t','y','u','i','o','p','[',']','\\'],
    ['Caps','a','s','d','f','g','h','j','k','l',';',"'",'Enter'],
    ['⇧','z','x','c','v','b','n','m',',','.','/','⇧'],
    ['Ctrl','Alt','Space','Alt','Ctrl'],
  ];

  // Keys that get a wider pill
  const WIDE_KEYS    = new Set(['Tab','Caps','⇧','Ctrl','Alt']);
  const WIDEST_KEYS  = new Set(['Space']);
  const WIDER_KEYS   = new Set(['Enter','⌫']);

  let _overlay      = null;
  let _oskEl        = null;
  let _target       = null;
  let _isShift      = false;
  let _isCaps       = false;
  let _focusRow     = 0;
  let _focusCol     = 0;
  let _keyEls       = [];   // 2D array: _keyEls[row][col]

  // ── Public API ───────────────────────────────────────────

  function show(targetInput) {
    _target = targetInput || document.activeElement;
    if (!_overlay) _build();
    _overlay.classList.remove('mbi-hidden');
    _focusRow = 2; _focusCol = 0;
    _updateFocus();
  }

  function hide() {
    if (_overlay) _overlay.classList.add('mbi-hidden');
    _target = null;
  }

  function isVisible() {
    return _overlay && !_overlay.classList.contains('mbi-hidden');
  }

  /**
   * Handle controller D-Pad / button events while the OSK is open.
   * Call this from ControllerHandler's custom action registrations
   * or directly from your integration entry point.
   *
   * @param {'up'|'down'|'left'|'right'|'confirm'|'backspace'|'space'|'shift'|'dismiss'} action
   */
  function handleInput(action) {
    if (!isVisible()) return false;
    switch (action) {
      case 'up':        _moveFocus(-1,  0); break;
      case 'down':      _moveFocus( 1,  0); break;
      case 'left':      _moveFocus( 0, -1); break;
      case 'right':     _moveFocus( 0,  1); break;
      case 'confirm': {
        const rowEls = _keyEls[_focusRow];
        const keyEl = rowEls && rowEls[_focusCol];
        const key = keyEl && keyEl.dataset && keyEl.dataset.key;
        if (key) {
          _pressKey(key);
        }
        break;
      }
      case 'backspace': _pressKey('⌫');  break;
      case 'space':     _pressKey('Space'); break;
      case 'shift':     _toggleShift(); break;
      case 'dismiss':   hide(); break;
    }
    return true;
  }

  // ── Build DOM ─────────────────────────────────────────────

  function _build() {
    _overlay = document.createElement('div');
    _overlay.id = 'mbi-osk-overlay';
    _overlay.classList.add('mbi-hidden');
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'On-screen keyboard');

    _oskEl = document.createElement('div');
    _oskEl.id = 'mbi-osk';
    _oskEl.setAttribute('role', 'application');
    _oskEl.setAttribute('aria-label', 'On-screen keyboard');

    _keyEls = [];
    ROWS.forEach((row, ri) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'mbi-osk-row';
      const rowKeys = [];
      row.forEach((key, ci) => {
        const btn = document.createElement('button');
        btn.className = 'mbi-key';
        if (WIDEST_KEYS.has(key))  btn.classList.add('mbi-key-widest');
        else if (WIDER_KEYS.has(key))  btn.classList.add('mbi-key-wider');
        else if (WIDE_KEYS.has(key))   btn.classList.add('mbi-key-wide');
        btn.dataset.key = key;
        btn.textContent = key;
        btn.setAttribute('aria-label', key === 'Space' ? 'Space' : key);
        btn.addEventListener('click', () => _pressKey(key));
        rowDiv.appendChild(btn);
        rowKeys.push(btn);
      });
      _keyEls.push(rowKeys);
      _oskEl.appendChild(rowDiv);
    });

    // Close when clicking outside the OSK
    _overlay.addEventListener('click', e => {
      if (e.target === _overlay) hide();
    });

    _overlay.appendChild(_oskEl);
    document.body.appendChild(_overlay);
  }

  // ── Key press logic ───────────────────────────────────────

  function _pressKey(key) {
    if (!key || !_target) return;
    const btn = _findKeyEl(key);
    if (btn) { btn.classList.add('mbi-key-active'); setTimeout(() => btn.classList.remove('mbi-key-active'), 120); }

    switch (key) {
      case '⌫':
        _deleteChar();
        return;
      case 'Enter':
        _insertText('\n');
        return;
      case 'Tab':
        _insertText('\t');
        return;
      case 'Space':
        _insertText(' ');
        return;
      case '⇧':
        _toggleShift();
        return;
      case 'Caps':
        _isCaps = !_isCaps;
        _refreshLabels();
        return;
      case 'Ctrl': case 'Alt':
        return; // modifiers handled externally
      default: {
        const upper = _isShift || _isCaps;
        _insertText(upper ? key.toUpperCase() : key.toLowerCase());
        if (_isShift) { _isShift = false; _refreshLabels(); }
      }
    }
  }

  function _insertText(text) {
    if (!_target) return;
    const s = _target.selectionStart ?? _target.value?.length ?? 0;
    const e = _target.selectionEnd   ?? s;
    if (typeof _target.value === 'string') {
      _target.value = _target.value.slice(0, s) + text + _target.value.slice(e);
      _target.selectionStart = _target.selectionEnd = s + text.length;
    }
    _target.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  }

  function _deleteChar() {
    if (!_target) return;
    const s = _target.selectionStart ?? 0;
    const e = _target.selectionEnd   ?? s;
    if (typeof _target.value === 'string') {
      if (s !== e) {
        _target.value = _target.value.slice(0, s) + _target.value.slice(e);
        _target.selectionStart = _target.selectionEnd = s;
      } else if (s > 0) {
        _target.value = _target.value.slice(0, s - 1) + _target.value.slice(s);
        _target.selectionStart = _target.selectionEnd = s - 1;
      }
    }
    _target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  }

  function _toggleShift() {
    _isShift = !_isShift;
    _refreshLabels();
  }

  function _refreshLabels() {
    const upper = _isShift || _isCaps;
    ROWS.forEach((row, ri) => {
      row.forEach((key, ci) => {
        const btn = _keyEls[ri]?.[ci];
        if (!btn) return;
        if (key.length === 1 && /[a-z]/.test(key)) {
          btn.textContent = upper ? key.toUpperCase() : key;
        }
      });
    });
  }

  // ── Focus management ──────────────────────────────────────

  function _moveFocus(dRow, dCol) {
    let newRow = _focusRow + dRow;
    let newCol = _focusCol + dCol;
    // Wrap row
    const rowsLen = ROWS.length;
    newRow = ((newRow % rowsLen) + rowsLen) % rowsLen;
    // Wrap column within row
    const rowLen = _keyEls[newRow]?.length || 0;
    newCol = ((newCol % rowLen) + rowLen) % rowLen;
    _focusRow = newRow;
    _focusCol = newCol;
    _updateFocus();
  }

  function _updateFocus() {
    _keyEls.forEach(row => row.forEach(btn => btn.classList.remove('mbi-key-focused')));
    const btn = _keyEls[_focusRow]?.[_focusCol];
    if (btn) {
      btn.classList.add('mbi-key-focused');
      btn.scrollIntoView({ block: 'nearest' });
    }
  }

  function _findKeyEl(key) {
    for (const row of _keyEls) {
      for (const btn of row) {
        if (btn.dataset.key === key) return btn;
      }
    }
    return null;
  }

  return { show, hide, isVisible, handleInput };
})();

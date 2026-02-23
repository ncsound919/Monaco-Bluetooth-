/**
 * integration.js – Monaco Bluetooth Controller Integration
 * =========================================================
 * Single entry point. Drop the five files in src/ into your
 * existing IDE and call MonacoBluetoothIntegration.init().
 *
 * Usage
 * -----
 *   // After your Monaco editor is ready:
 *   MonacoBluetoothIntegration.init({
 *     editor:    myEditorInstance,    // monaco.editor.IStandaloneCodeEditor
 *     monaco:    monaco,              // the monaco namespace
 *     // Optional DOM element references for auto mode-switching:
 *     editorEl:  document.getElementById('your-editor-container'),
 *     sidebarEl: document.getElementById('your-sidebar'),
 *     terminalEl:document.getElementById('your-terminal'),
 *     chatInput: document.getElementById('your-chat-input'),
 *     // Optional status badge injection (set to null to skip):
 *     statusTarget: document.getElementById('your-status-bar'),
 *     // Optional: double-tap window in ms for OSK trigger (default 400):
 *     doubleTapMs: 400,
 *   });
 *
 * HTML additions (add once to your IDE's HTML)
 * --------------------------------------------
 *   <link rel="stylesheet" href="src/style.css" />
 *   <script src="src/modes.js"></script>
 *   <script src="src/bluetooth.js"></script>
 *   <script src="src/controller.js"></script>
 *   <script src="src/keyboard.js"></script>
 *   <script src="src/voice.js"></script>
 *   <script src="src/integration.js"></script>
 *
 * The Connect-controller button
 * -----------------------------
 * Add anywhere in your IDE HTML:
 *   <button id="mbi-connect-btn">🎮 Connect Controller</button>
 * The integration wires it up automatically.
 *
 * Source: Bluetooth Monaco configuration file
 */

const MonacoBluetoothIntegration = (() => {

  // Default double-tap window in ms; overridable via options.doubleTapMs
  const DEFAULT_DOUBLE_TAP_MS = 400;

  let _opts        = {};
  let _initialized = false;

  // ── Public API ───────────────────────────────────────────

  function init(options = {}) {
    // Guard against duplicate initialization
    if (_initialized) {
      console.warn('[MBI] Already initialized. Call destroy() before re-initializing.');
      return;
    }
    _opts        = options;
    _initialized = true;

    const {
      editor,
      monaco: monacoNS,
      editorEl,
      sidebarEl,
      terminalEl,
      chatInput,
      statusTarget,
    } = options;

    // 1. Mode switching
    if (typeof Modes !== 'undefined') {
      Modes.init({ editor: editorEl, sidebar: sidebarEl, terminal: terminalEl, chatInput });
    } else {
      console.warn('[MBI] Modes module not loaded – mode switching disabled.');
    }

    // 2. Monaco editor integration (controller + voice)
    if (editor && monacoNS) {
      if (typeof ControllerHandler !== 'undefined') {
        ControllerHandler.init(editor, monacoNS);
      }
      if (typeof VoiceInput !== 'undefined') {
        VoiceInput.init(editor);
      }
    } else {
      console.warn('[MBI] No editor instance supplied – controller axis movement and voice insert will be limited.');
    }

    // 3. Register OSK-related controller actions
    if (typeof ControllerHandler !== 'undefined' && typeof OnScreenKeyboard !== 'undefined') {
      _registerOskActions();
    }

    // 4. Register voice-input controller actions
    if (typeof ControllerHandler !== 'undefined' && typeof VoiceInput !== 'undefined') {
      _registerVoiceActions();
    }

    // 5. Bluetooth status badge
    _injectStatusBadge(statusTarget);
    if (typeof BluetoothManager !== 'undefined') {
      BluetoothManager.onStatus(_onBluetoothStatus);
    }

    // 6. Wire connect button (if present in the host IDE)
    const connectBtn = document.getElementById('mbi-connect-btn');
    if (connectBtn && typeof BluetoothManager !== 'undefined') {
      connectBtn.addEventListener('click', _onConnectClick);
    }
  }

  /**
   * Tear down the integration: stops the controller poller, removes the
   * connect-button listener, and resets state so init() can be called again.
   */
  function destroy() {
    if (!_initialized) return;

    if (typeof ControllerHandler !== 'undefined') {
      ControllerHandler.destroy();
    }
    if (typeof BluetoothManager !== 'undefined') {
      BluetoothManager.disconnect();
    }

    const connectBtn = document.getElementById('mbi-connect-btn');
    if (connectBtn) connectBtn.removeEventListener('click', _onConnectClick);

    const badge = document.getElementById('mbi-status-badge');
    if (badge) badge.remove();

    _opts        = {};
    _initialized = false;
  }

  // ── Private helpers ───────────────────────────────────────

  function _onConnectClick() { BluetoothManager.connect(); }

  /**
   * Register Double-tap Cross_A → open OSK, and D-Pad navigation while OSK is open.
   * Source: bluetooth.onScreenKeyboard.trigger = "Double-tap Cross_A on any text input"
   */
  function _registerOskActions() {
    const doubleTapMs = (typeof _opts.doubleTapMs === 'number' ? _opts.doubleTapMs : DEFAULT_DOUBLE_TAP_MS);
    let _lastCrossA = 0;

    // Double-tap Cross_A opens the OSK
    ControllerHandler.registerAction('global', 'Cross_A', () => {
      const now = Date.now();
      if (now - _lastCrossA < doubleTapMs) {
        const active = document.activeElement;
        if (active && ('value' in active || active.isContentEditable)) {
          OnScreenKeyboard.show(active);
        }
      }
      _lastCrossA = now;
    });

    // While OSK is visible, intercept D-Pad and face buttons
    const oskMappings = {
      'DPad_Up':    'up',
      'DPad_Down':  'down',
      'DPad_Left':  'left',
      'DPad_Right': 'right',
      'Cross_A':    'confirm',
      'Square_X':   'backspace',
      'L1_LB+Cross_A': 'space',
      'Circle_B':   'dismiss',
    };

    Object.entries(oskMappings).forEach(([combo, action]) => {
      ControllerHandler.registerAction('global', combo, () => {
        if (OnScreenKeyboard.isVisible()) {
          OnScreenKeyboard.handleInput(action);
        }
      });
    });
  }

  /**
   * Register Hold Triangle_Y → voice input start/stop.
   * Source: bluetooth.voiceInput.trigger = "Hold Triangle_Y in chat or editor"
   */
  function _registerVoiceActions() {
    // Triangle_Y press → start voice
    ControllerHandler.registerAction('editor', 'Triangle_Y', () => {
      if (!VoiceInput.isActive()) VoiceInput.start();
    });
    ControllerHandler.registerAction('chat', 'Triangle_Y', () => {
      if (!VoiceInput.isActive()) VoiceInput.start();
    });
    // Releasing Triangle_Y stops voice (use registerAction with a release hook if desired)
    // For simplicity the SpeechRecognition fires onend automatically after a pause.
  }

  /** Inject a small status badge into the host IDE's status bar. */
  function _injectStatusBadge(container) {
    if (!container) return;
    const badge = document.createElement('span');
    badge.id = 'mbi-status-badge';
    badge.className = 'mbi-disconnected';
    badge.textContent = '🎮 Disconnected';
    container.appendChild(badge);
  }

  function _onBluetoothStatus(text, state) {
    const badge = document.getElementById('mbi-status-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = '';
    if (state === 'connected')    badge.classList.add('mbi-connected');
    else if (state === 'warn')    badge.classList.add('mbi-warn');
    else                          badge.classList.add('mbi-disconnected');
  }

  return { init, destroy };
})();

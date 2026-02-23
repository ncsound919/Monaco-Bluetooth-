/**
 * voice.js – Web Speech API voice input
 * Source: bluetooth.voiceInput in Bluetooth Monaco config
 *
 * Hold Triangle_Y / Y in chat or editor to record speech.
 * The recognized text is inserted into the focused target.
 */

const VoiceInput = (() => {
  // Normalise vendor-prefixed API at module load time
  if (!('SpeechRecognition' in window) && 'webkitSpeechRecognition' in window) {
    window.SpeechRecognition = window.webkitSpeechRecognition;
  }

  const LANGUAGE        = 'en-US';
  const INTERIM_RESULTS = true;

  let _recognition  = null;
  let _indicator    = null;
  let _active       = false;
  let _editor       = null;  // monaco editor instance (optional)
  let _onResultFn   = null;  // custom result callback

  // ── Public API ───────────────────────────────────────────

  /**
   * Initialise. Call once after the page loads.
   * @param {object} [editor] - monaco.editor.IStandaloneCodeEditor (optional)
   */
  function init(editor) {
    _editor = editor || null;
    _buildIndicator();
  }

  /** Start recording. Safe to call if already active. */
  function start() {
    if (_active) return;
    if (!_isSupported()) {
      console.warn('[VoiceInput] Web Speech API not supported in this browser.');
      return;
    }
    _recognition = new window.SpeechRecognition();
    _recognition.lang             = LANGUAGE;
    _recognition.interimResults   = INTERIM_RESULTS;
    _recognition.continuous       = false;
    _recognition.onresult         = _onResult;
    _recognition.onerror          = _onError;
    _recognition.onend            = _onEnd;
    try {
      _recognition.start();
      _active = true;
      _showIndicator();
    } catch (e) {
      console.error('[VoiceInput] start failed', e);
    }
  }

  /** Stop recording. */
  function stop() {
    if (!_active || !_recognition) return;
    _recognition.stop();
    // _onEnd will fire and clean up
  }

  function isActive() { return _active; }

  /**
   * Override the default insert behaviour.
   * fn(finalText, targetElement) is called with the recognised text.
   */
  function onResult(fn) { _onResultFn = fn; }

  // ── Private ───────────────────────────────────────────────

  function _isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  function _onResult(event) {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }
    if (final) {
      const target = document.activeElement;
      if (_onResultFn) {
        _onResultFn(final, target);
      } else {
        _defaultInsert(final, target);
      }
    }
    // Update indicator with interim text
    if (_indicator && interim) {
      _indicator.textContent = `🎤 ${interim}`;
    }
  }

  function _onError(e) {
    console.warn('[VoiceInput] error', e.error);
    _cleanup();
  }

  function _onEnd() { _cleanup(); }

  function _cleanup() {
    _active = false;
    _recognition = null;
    _hideIndicator();
  }

  function _defaultInsert(text, target) {
    // If a Monaco editor is active, insert at cursor
    if (_editor && document.activeElement &&
        document.getElementById('monaco-editor')?.contains(document.activeElement)) {
      const selection = _editor.getSelection();
      _editor.executeEdits('voice-input', [{
        range: selection,
        text,
        forceMoveMarkers: true,
      }]);
      return;
    }
    // Otherwise insert into a focused text input / textarea
    if (target && ('value' in target)) {
      const s = target.selectionStart ?? target.value.length;
      const e = target.selectionEnd   ?? s;
      target.value = target.value.slice(0, s) + text + target.value.slice(e);
      target.selectionStart = target.selectionEnd = s + text.length;
      target.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
  }

  // ── Indicator DOM ─────────────────────────────────────────

  function _buildIndicator() {
    if (document.getElementById('mbi-voice-indicator')) return;
    _indicator = document.createElement('div');
    _indicator.id = 'mbi-voice-indicator';
    _indicator.className = 'mbi-hidden';
    _indicator.textContent = '🎤 Listening…';
    _indicator.setAttribute('role', 'status');
    _indicator.setAttribute('aria-live', 'assertive');
    document.body.appendChild(_indicator);
  }

  function _showIndicator() {
    const el = document.getElementById('mbi-voice-indicator');
    if (el) { el.textContent = '🎤 Listening…'; el.classList.remove('mbi-hidden'); }
  }

  function _hideIndicator() {
    const el = document.getElementById('mbi-voice-indicator');
    if (el) el.classList.add('mbi-hidden');
  }

  return { init, start, stop, isActive, onResult };
})();

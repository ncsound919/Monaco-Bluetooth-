# Monaco Bluetooth Controller Integration

Drop-in Bluetooth gamepad integration for any Monaco editor IDE.

## What it does

| Module | Description |
|---|---|
| `src/bluetooth.js` | Pairs to a BLE HID controller via the Web Bluetooth API, handles auto-reconnect (up to 5 attempts, 3 s interval), and monitors battery level |
| `src/controller.js` | Polls the Gamepad API at 60 Hz and maps unified PlayStation / Xbox buttons to Monaco editor commands (cursor movement, editing, navigation, IntelliSense) |
| `src/keyboard.js` | On-screen QWERTY keyboard overlay navigated entirely by D-Pad + face buttons; triggered by double-tapping Cross/A on any text input |
| `src/voice.js` | Web Speech API voice input; hold Triangle/Y to dictate into the editor or a chat input |
| `src/modes.js` | Context-aware mode switching (global → editor → sidebar → terminal → chat → dialog) so the same button combos do different things depending on focus |
| `src/integration.js` | Single entry point that wires all modules together with one `init()` call |
| `src/style.css` | Overlay-only styles for the OSK and voice indicator; does **not** touch your existing IDE theme |

## Installation

1. Copy the `src/` folder into your project.
2. Add to your IDE's HTML **once**:

```html
<link rel="stylesheet" href="src/style.css" />

<!-- Optional connect button anywhere in your UI -->
<button id="mbi-connect-btn">🎮 Connect Controller</button>

<script src="src/modes.js"></script>
<script src="src/bluetooth.js"></script>
<script src="src/controller.js"></script>
<script src="src/keyboard.js"></script>
<script src="src/voice.js"></script>
<script src="src/integration.js"></script>
```

3. After your Monaco editor is ready, call:

```js
MonacoBluetoothIntegration.init({
  editor:       myEditor,                               // IStandaloneCodeEditor
  monaco:       monaco,                                 // the monaco namespace
  // Optional – pass your IDE's DOM elements for auto mode-switching:
  editorEl:     document.getElementById('editor'),
  sidebarEl:    document.getElementById('sidebar'),
  terminalEl:   document.getElementById('terminal'),
  chatInput:    document.getElementById('chat-input'),
  // Optional – inject the controller status badge into your status bar:
  statusTarget: document.getElementById('status-bar'),
});
```

## Button mapping overview

| Combo | Mode | Action |
|---|---|---|
| Cross/A (double-tap) | any text input | Open on-screen keyboard |
| Triangle/Y (hold) | editor / chat | Voice input |
| Start/Menu | global | Command palette |
| Select/View | global | Quick open |
| L1 + □/X | editor | Copy |
| L1 + △/Y | editor | Cut |
| L1 + ○/B | editor | Paste |
| L2 + □/X | editor | Undo |
| L2 + △/Y | editor | Redo |
| L2 + ○/B | editor | Save |
| R2 + △/Y | editor | Format document |
| R3 | editor | Go to definition |
| L3 + □/X | editor | Find |
| Left stick | editor | Move cursor |
| Right stick | editor | Scroll (hold L2 for 3× speed) |
| R2 | tabs | Next tab |
| L2 | tabs | Previous tab |

Full mapping is in `src/controller.js` → `ACTION_MAP`.

## Browser requirements

- **Web Bluetooth API** – Chrome / Edge 56+, requires HTTPS or localhost
- **Gamepad API** – all modern browsers
- **Web Speech API** – Chrome / Edge (for voice input)

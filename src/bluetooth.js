/**
 * bluetooth.js – Web Bluetooth API manager
 * Source: bluetooth section of Bluetooth Monaco config
 *
 * Manages pairing, auto-reconnect, and controller battery monitoring.
 * Battery is read from the controller itself via:
 *   1. Gamepad API gamepad.battery property (Chrome M122+ / experimental)
 *   2. BLE Battery Service (UUID 0x180F) characteristic (UUID 0x2A19)
 * The host device's battery is never used.
 * Fires callbacks so the rest of the integration can react to state changes.
 */

const BluetoothManager = (() => {
  const SERVICE_UUID          = '0000ffe0-0000-1000-8000-00805f9b34fb';
  const CHARACTERISTIC_UUID   = '0000ffe1-0000-1000-8000-00805f9b34fb';
  // Standard BLE Battery Service / Level characteristic
  const BATTERY_SERVICE_UUID  = '0000180f-0000-1000-8000-00805f9b34fb';
  const BATTERY_CHAR_UUID     = '00002a19-0000-1000-8000-00805f9b34fb';
  const RECONNECT_INTERVAL_MS  = 3000;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BATTERY_WARN_THRESHOLD = 15;
  const BATTERY_POLL_MS        = 30000; // poll BLE battery every 30 s

  let _device          = null;
  let _characteristic  = null;
  let _reconnectTimer  = null;
  let _reconnectCount  = 0;
  let _batteryTimer    = null;

  const _onDataCallbacks   = [];
  const _onStatusCallbacks = [];

  // ── Public API ──────────────────────────────────────────

  async function connect() {
    if (!navigator.bluetooth) {
      _fireStatus('🎮 BT unavailable', 'disconnected');
      console.warn('[BluetoothManager] Web Bluetooth API not available in this browser.');
      return;
    }
    try {
      _device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      });
      _device.addEventListener('gattserverdisconnected', _onDisconnect);
      await _connectGatt();
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('[BluetoothManager] connect failed', err);
        _fireStatus('🎮 Connect failed', 'disconnected');
      }
    }
  }

  function disconnect() {
    clearTimeout(_reconnectTimer);
    clearInterval(_batteryTimer);
    if (_device && _device.gatt.connected) _device.gatt.disconnect();
    _device = null;
    _characteristic = null;
    _fireStatus('🎮 Disconnected', 'disconnected');
  }

  /** Send raw bytes or a UTF-8 string to the connected peripheral. */
  async function send(data) {
    if (!_characteristic) return;
    try {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      await _characteristic.writeValue(bytes);
    } catch (err) {
      console.warn('[BluetoothManager] send error', err);
    }
  }

  function isConnected() {
    return !!(_device && _device.gatt.connected);
  }

  /** Register a callback for incoming BLE notifications: fn(DataView). */
  function onData(fn)   { _onDataCallbacks.push(fn); }

  /**
   * Register a callback for connection-state changes.
   * fn(text: string, state: 'connected' | 'disconnected' | 'warn' | 'battery')
   *   'connected'    – controller paired successfully
   *   'disconnected' – controller disconnected or connect failed
   *   'warn'         – battery level at or below warning threshold
   *   'battery'      – battery level update (above warning threshold)
   */
  function onStatus(fn) { _onStatusCallbacks.push(fn); }

  // ── Private helpers ──────────────────────────────────────

  async function _connectGatt() {
    const server  = await _device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID).catch(() => null);
    if (service) {
      _characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID).catch(() => null);
      if (_characteristic) {
        await _characteristic.startNotifications();
        _characteristic.addEventListener('characteristicvaluechanged', _onData);
      }
    }
    _reconnectCount = 0;
    _fireStatus('🎮 Connected', 'connected');
    _vibrate(200);
    _startBatteryMonitor(server);
  }

  function _onDisconnect() {
    _characteristic = null;
    _fireStatus('🎮 Disconnected', 'disconnected');
    _scheduleReconnect();
  }

  function _scheduleReconnect() {
    if (_reconnectCount >= MAX_RECONNECT_ATTEMPTS || !_device) return;
    _reconnectTimer = setTimeout(async () => {
      if (_reconnectCount >= MAX_RECONNECT_ATTEMPTS || !_device) return;
      _reconnectCount++;
      try { await _connectGatt(); } catch { _scheduleReconnect(); }
    }, RECONNECT_INTERVAL_MS);
  }

  function _onData(event) {
    _onDataCallbacks.forEach(fn => fn(event.target.value));
  }

  function _fireStatus(text, state) {
    _onStatusCallbacks.forEach(fn => fn(text, state));
  }

  function _vibrate(durationMs, pattern) {
    if (!navigator.vibrate) return;
    pattern ? navigator.vibrate(pattern) : navigator.vibrate(durationMs);
  }

  /**
   * Monitor the *controller's* battery level.
   * Priority:
   *  1. Gamepad API `gamepad.battery` (experimental, Chrome M122+) – polled every 30 s
   *  2. BLE Battery Service characteristic 0x2A19 – polled every 30 s
   * The host device's Battery Status API is intentionally not used here.
   */
  async function _startBatteryMonitor(server) {
    // 1. Try Gamepad API battery property; poll periodically since no change event exists
    const _pollGamepadBattery = () => {
      const gamepads = (typeof navigator !== 'undefined' && navigator.getGamepads)
        ? navigator.getGamepads() : [];
      for (const gp of gamepads) {
        if (!gp) continue;
        if (gp.battery && typeof gp.battery.level === 'number') {
          _reportBattery(Math.round(gp.battery.level * 100));
          return true;
        }
      }
      return false;
    };

    if (_pollGamepadBattery()) {
      _batteryTimer = setInterval(_pollGamepadBattery, BATTERY_POLL_MS);
      return;
    }

    // 2. Try BLE Battery Service characteristic
    try {
      const battService = await server.getPrimaryService(BATTERY_SERVICE_UUID).catch(() => null);
      if (!battService) return;
      const battChar = await battService.getCharacteristic(BATTERY_CHAR_UUID).catch(() => null);
      if (!battChar) return;

      const _readBatteryChar = async () => {
        try {
          const value = await battChar.readValue();
          const pct = value.getUint8(0);
          _reportBattery(pct);
        } catch { /* characteristic may not be readable while disconnected */ }
      };

      await _readBatteryChar();
      _batteryTimer = setInterval(_readBatteryChar, BATTERY_POLL_MS);
    } catch { /* BLE Battery Service not available on this controller */ }
  }

  function _reportBattery(pct) {
    const state = pct <= BATTERY_WARN_THRESHOLD ? 'warn' : 'battery';
    _fireStatus(`🔋 ${pct}%`, state);
    if (pct <= BATTERY_WARN_THRESHOLD) _vibrate(null, [100, 50, 100]);
  }

  return { connect, disconnect, send, isConnected, onData, onStatus };
})();

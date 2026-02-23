/**
 * bluetooth.js – Web Bluetooth API manager
 * Source: bluetooth section of Bluetooth Monaco config
 *
 * Manages pairing, auto-reconnect, and battery monitoring for the
 * Bluetooth HID controller. Fires callbacks so the rest of the
 * integration can react to connection state changes.
 */

const BluetoothManager = (() => {
  const SERVICE_UUID        = '0000ffe0-0000-1000-8000-00805f9b34fb';
  const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
  const RECONNECT_INTERVAL_MS = 3000;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BATTERY_WARN_THRESHOLD = 15;

  let _device          = null;
  let _characteristic  = null;
  let _reconnectTimer  = null;
  let _reconnectCount  = 0;

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
   * fn(text: string, state: 'connected' | 'disconnected')
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
    _startBatteryMonitor();
  }

  function _onDisconnect() {
    _characteristic = null;
    _fireStatus('🎮 Disconnected', 'disconnected');
    _scheduleReconnect();
  }

  function _scheduleReconnect() {
    if (_reconnectCount >= MAX_RECONNECT_ATTEMPTS || !_device) return;
    _reconnectCount++;
    _reconnectTimer = setTimeout(async () => {
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

  /** Battery Status API – best-effort; shows level + warns when low. */
  async function _startBatteryMonitor() {
    if (!navigator.getBattery) return;
    try {
      const battery = await navigator.getBattery();
      const report = () => {
        const pct = Math.round(battery.level * 100);
        _onStatusCallbacks.forEach(fn => fn(`🔋 ${pct}%`, pct <= BATTERY_WARN_THRESHOLD ? 'warn' : 'battery'));
        if (pct <= BATTERY_WARN_THRESHOLD) _vibrate(null, [100, 50, 100]);
      };
      battery.addEventListener('levelchange', report);
      report();
    } catch { /* Battery Status API not available */ }
  }

  return { connect, disconnect, send, isConnected, onData, onStatus };
})();

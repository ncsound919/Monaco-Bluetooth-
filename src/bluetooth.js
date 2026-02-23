/**
 * bluetooth.js – Web Bluetooth API manager
 * Source: bluetooth section of Bluetooth Monaco config
 */

const BluetoothManager = (() => {
  const SERVICE_UUID        = '0000ffe0-0000-1000-8000-00805f9b34fb';
  const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
  const RECONNECT_INTERVAL  = 3000;
  const MAX_RECONNECT       = 5;
  const BATTERY_WARN        = 15;

  let device          = null;
  let characteristic  = null;
  let reconnectTimer  = null;
  let reconnectCount  = 0;
  let batteryLevel    = null;
  const dataListeners = [];
  const statusListeners = [];

  function _updateStatus(text, color) {
    const el = document.getElementById('controller-status');
    if (el) { el.textContent = text; el.style.color = color || ''; }
    statusListeners.forEach(fn => fn(text, color));
  }

  async function connect() {
    if (!navigator.bluetooth) {
      _updateStatus('🎮 BT unavailable', '#f48771');
      console.warn('[BT] Web Bluetooth API not supported in this browser.');
      return;
    }
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      });
      device.addEventListener('gattserverdisconnected', _onDisconnect);
      await _connectGatt();
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('[BT] connect error', err);
        _updateStatus('🎮 Connect failed', '#f48771');
      }
    }
  }

  async function _connectGatt() {
    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID).catch(() => null);
    if (service) {
      characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID).catch(() => null);
      if (characteristic) {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', _onData);
      }
    }
    reconnectCount = 0;
    _updateStatus('🎮 Connected', '#4ec9b0');
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) connectBtn.classList.add('connected');
    _vibrate(200, 0.5);
    _tryBatteryMonitor(device.gatt);
  }

  function _onDisconnect() {
    characteristic = null;
    _updateStatus('🎮 Disconnected', '#f48771');
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) connectBtn.classList.remove('connected');
    _scheduleReconnect();
  }

  function _scheduleReconnect() {
    if (reconnectCount >= MAX_RECONNECT || !device) return;
    reconnectCount++;
    reconnectTimer = setTimeout(async () => {
      try {
        await _connectGatt();
      } catch {
        _scheduleReconnect();
      }
    }, RECONNECT_INTERVAL);
  }

  function _onData(event) {
    const value = event.target.value;
    dataListeners.forEach(fn => fn(value));
  }

  async function send(data) {
    if (!characteristic) return;
    try {
      const encoded = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : data;
      await characteristic.writeValue(encoded);
    } catch (err) {
      console.warn('[BT] send error', err);
    }
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    if (device && device.gatt.connected) {
      device.gatt.disconnect();
    }
    device = null;
    characteristic = null;
    _updateStatus('🎮 Disconnected', '#f48771');
  }

  /** Battery monitoring via standard Battery Status API (best effort) */
  async function _tryBatteryMonitor(gatt) {
    if (!navigator.getBattery) return;
    try {
      const battery = await navigator.getBattery();
      batteryLevel = Math.round(battery.level * 100);
      _updateBatteryUI();
      battery.addEventListener('levelchange', () => {
        batteryLevel = Math.round(battery.level * 100);
        _updateBatteryUI();
        if (batteryLevel <= BATTERY_WARN) {
          _vibrate(null, 0.8, [100, 50, 100]);
        }
      });
    } catch { /* not available */ }
  }

  function _updateBatteryUI() {
    const el = document.getElementById('battery-status');
    if (!el) return;
    if (batteryLevel !== null) {
      el.textContent = `🔋 ${batteryLevel}%`;
      el.classList.remove('hidden');
      el.style.color = batteryLevel <= BATTERY_WARN ? '#f48771' : '';
    }
  }

  function _vibrate(duration, intensity, pattern) {
    if (!navigator.vibrate) return;
    if (pattern) { navigator.vibrate(pattern); }
    else if (duration) { navigator.vibrate(duration); }
  }

  function onData(fn)   { dataListeners.push(fn); }
  function onStatus(fn) { statusListeners.push(fn); }

  return { connect, disconnect, send, onData, onStatus };
})();

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Heart, BatteryMedium, Bluetooth, X } from "lucide-react";

const HEART_RATE_SERVICE = 0x180d;
const HEART_RATE_MEASUREMENT = 0x2a37;
const BATTERY_SERVICE = 0x180f;
const BATTERY_LEVEL = 0x2a19;

export default function HealthWidget() {
  const supported = typeof navigator !== "undefined" && !!navigator.bluetooth;
  const [connecting, setConnecting] = useState(false);
  const [device, setDevice] = useState(null);
  const [deviceName, setDeviceName] = useState("");
  const [heartRate, setHeartRate] = useState(null);
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState(null);

  const onHeartRate = useCallback((event) => {
    const value = event.target.value;
    const flags = value.getUint8(0);
    setHeartRate(flags & 0x1 ? value.getUint16(1, true) : value.getUint8(1));
  }, []);

  const reset = () => {
    setDevice(null);
    setHeartRate(null);
    setBattery(null);
    setDeviceName("");
  };

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const dev = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: [BATTERY_SERVICE],
      });
      setDevice(dev);
      setDeviceName(dev.name || "Health device");
      dev.addEventListener("gattserverdisconnected", reset);
      const server = await dev.gatt.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", onHeartRate);
      try {
        const bService = await server.getPrimaryService(BATTERY_SERVICE);
        const bChar = await bService.getCharacteristic(BATTERY_LEVEL);
        setBattery((await bChar.readValue()).getUint8(0));
      } catch { /* device has no battery service */ }
    } catch (e) {
      if (e.name !== "NotFoundError") setError(e.message || "Couldn't connect to device");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    if (device?.gatt?.connected) device.gatt.disconnect();
    reset();
  };

  if (!supported) return null;

  return (
    <div className="mb-8 rise-in">
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      {device ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card border border-border/70 rounded-2xl p-4">
          <div className="flex items-center gap-2.5 pr-4 border-r border-border/60">
            <Heart
              className="w-6 h-6 text-rose-500"
              style={heartRate ? { animation: `heartbeat ${Math.max(0.4, 60 / heartRate)}s ease-in-out infinite` } : undefined}
              fill="currentColor"
            />
            <div>
              <div className="text-2xl font-display font-light leading-none">{heartRate ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">BPM</div>
            </div>
          </div>
          <div className="flex items-center gap-2 pr-4 border-r border-border/60">
            <Bluetooth className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{deviceName}</span>
          </div>
          {battery !== null && (
            <div className="flex items-center gap-2 pr-4 border-r border-border/60">
              <BatteryMedium className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{battery}%</span>
            </div>
          )}
          <Button onClick={disconnect} variant="ghost" size="sm" className="ml-auto rounded-full">
            <X className="w-4 h-4" /> Disconnect
          </Button>
        </div>
      ) : (
        <Button onClick={connect} disabled={connecting} variant="outline" className="rounded-full">
          <Bluetooth className="w-4 h-4 mr-1.5" />
          {connecting ? "Connecting…" : "Connect health device"}
        </Button>
      )}
    </div>
  );
}
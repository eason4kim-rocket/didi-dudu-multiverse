import type { Actuator, ControlState } from "../control/commands";
import { t } from "../i18n";
import { HARDWARE_HZ, NUS_RX, NUS_SERVICE, encodeFrame } from "./protocol";

export type HardwareTransport = "serial" | "ble" | null;

export class HardwareAdapter implements Actuator {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private bleChar: BluetoothRemoteGATTCharacteristic | null = null;
  private bleDevice: BluetoothDevice | null = null;
  private lastSent = 0;
  private lastPayload = "";
  private writing = false;
  private readonly encoder = new TextEncoder();

  transport: HardwareTransport = null;
  status = t("hw.idle");
  onStatus?: (status: string, transport: HardwareTransport) => void;

  get connected(): boolean {
    return this.transport !== null;
  }

  async connectSerial(): Promise<void> {
    if (!navigator.serial) {
      this.setStatus(t("hw.noSerial"), null);
      return;
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    await this.disconnect();
    this.port = port;
    this.writer = port.writable?.getWriter() ?? null;
    this.transport = "serial";
    this.setStatus(t("hw.serialConnected"), "serial");
    port.addEventListener("disconnect", () => {
      void this.disconnect();
    });
    void this.drain(port);
  }

  async connectBluetooth(): Promise<void> {
    if (!navigator.bluetooth) {
      this.setStatus(t("hw.noBle"), null);
      return;
    }
    const device = await requestBleDevice();
    const server = await device.gatt?.connect();
    if (!server) {
      this.setStatus(t("hw.bleGattFail"), null);
      return;
    }
    const service = await server.getPrimaryService(NUS_SERVICE);
    const characteristic = await service.getCharacteristic(NUS_RX);
    await this.disconnect();
    this.bleDevice = device;
    this.bleChar = characteristic;
    this.transport = "ble";
    this.setStatus(t("hw.bleConnected", { name: device.name ?? "BB-8" }), "ble");
    device.addEventListener("gattserverdisconnected", () => {
      void this.disconnect();
    });
  }

  async disconnect(): Promise<void> {
    const writer = this.writer;
    this.writer = null;
    if (writer) {
      try {
        writer.releaseLock();
      } catch {
        /* already released */
      }
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch {
        /* port already closed */
      }
    }
    this.port = null;
    this.bleDevice?.gatt?.disconnect();
    this.bleDevice = null;
    this.bleChar = null;
    if (this.transport !== null) {
      this.setStatus(t("hw.idle"), null);
    }
    this.transport = null;
    this.lastPayload = "";
  }

  apply(state: ControlState, _dt: number): void {
    if (!this.connected) {
      return;
    }
    const now = performance.now();
    if (!state.emote && now - this.lastSent < 1000 / HARDWARE_HZ) {
      return;
    }
    const payload = encodeFrame(state);
    if (payload === this.lastPayload && !state.emote) {
      return;
    }
    this.lastSent = now;
    this.lastPayload = payload;
    void this.send(payload);
  }

  private async send(payload: string): Promise<void> {
    if (this.writing) {
      return;
    }
    this.writing = true;
    const bytes = this.encoder.encode(payload);
    try {
      if (this.writer) {
        await this.writer.write(bytes);
      } else if (this.bleChar) {
        await this.bleChar.writeValueWithoutResponse(bytes);
      }
    } catch {
      this.setStatus(t("hw.sendFail"), null);
      await this.disconnect();
    } finally {
      this.writing = false;
    }
  }

  private async drain(port: SerialPort): Promise<void> {
    const reader = port.readable?.getReader();
    if (!reader) {
      return;
    }
    try {
      while (this.port === port) {
        const { done } = await reader.read();
        if (done) {
          break;
        }
      }
    } catch {
      /* disconnected */
    } finally {
      reader.releaseLock();
    }
  }

  private setStatus(status: string, transport: HardwareTransport): void {
    this.status = status;
    this.transport = transport;
    this.onStatus?.(status, transport);
  }
}

async function requestBleDevice(): Promise<BluetoothDevice> {
  const bluetooth = navigator.bluetooth;
  if (!bluetooth) {
    throw new Error("Web Bluetooth 不可用");
  }
  try {
    return await bluetooth.requestDevice({
      filters: [{ namePrefix: "BB8" }, { namePrefix: "BB-8" }, { services: [NUS_SERVICE] }],
      optionalServices: [NUS_SERVICE],
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [NUS_SERVICE],
    });
  }
}

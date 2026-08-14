// BB-8 command bridge. Reads one JSON line per tick from USB serial
// (115200) or Nordic UART BLE, then maps fields onto motor/servo pins.
//
// {"drive":0.5,"turn":-0.2,"lookYaw":0.1,"lookPitch":0,"emote":1}
//
// drive/turn: -1..1  -> drive wheel / yaw unit
// lookYaw/lookPitch: radians -> head servos
// emote: 0 none, 1 chirp, 2 excited, 3 curious, 4 yes, 5 no, 6 scared

#include <Arduino.h>

#ifdef ESP32
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#endif

static const int PIN_DRIVE = 25;
static const int PIN_TURN = 26;
static const int PIN_LOOK_YAW = 18;
static const int PIN_LOOK_PITCH = 19;

static const char *NUS_SERVICE = "6e400001-b5a3-f393-e0a3-e24d89100fb4";
static const char *NUS_RX = "6e400002-b5a3-f393-e0a3-e24d89100fb4";
static const char *NUS_TX = "6e400003-b5a3-f393-e0a3-e24d89100fb4";

String line;

float extractFloat(const String &src, const char *key) {
  int i = src.indexOf(key);
  if (i < 0) {
    return 0;
  }
  i = src.indexOf(':', i);
  if (i < 0) {
    return 0;
  }
  return src.substring(i + 1).toFloat();
}

int extractInt(const String &src, const char *key) {
  int i = src.indexOf(key);
  if (i < 0) {
    return 0;
  }
  i = src.indexOf(':', i);
  if (i < 0) {
    return 0;
  }
  return src.substring(i + 1).toInt();
}

int toPwm(float value) {
  float clamped = constrain(value, -1.0f, 1.0f);
  return (int)((clamped * 0.5f + 0.5f) * 255.0f);
}

void applyCommand(const String &src) {
  float drive = extractFloat(src, "\"drive\"");
  float turn = extractFloat(src, "\"turn\"");
  float lookYaw = extractFloat(src, "\"lookYaw\"");
  float lookPitch = extractFloat(src, "\"lookPitch\"");
  int emote = extractInt(src, "\"emote\"");

  analogWrite(PIN_DRIVE, toPwm(drive));
  analogWrite(PIN_TURN, toPwm(turn));
  analogWrite(PIN_LOOK_YAW, toPwm(lookYaw / 0.7f));
  analogWrite(PIN_LOOK_PITCH, toPwm(lookPitch / 0.35f));

  Serial.print("ok drive=");
  Serial.print(drive);
  Serial.print(" turn=");
  Serial.print(turn);
  Serial.print(" emote=");
  Serial.println(emote);
}

void handleByte(char c) {
  if (c == '\n') {
    line.trim();
    if (line.length() > 0) {
      applyCommand(line);
    }
    line = "";
    return;
  }
  if (line.length() < 180) {
    line += c;
  }
}

#ifdef ESP32
class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    std::string value = characteristic->getValue();
    for (char c : value) {
      handleByte(c);
    }
  }
};

void setupBle() {
  BLEDevice::init("BB8");
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService(NUS_SERVICE);
  BLECharacteristic *rx = service->createCharacteristic(
      NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallbacks());
  BLECharacteristic *tx = service->createCharacteristic(
      NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  tx->addDescriptor(new BLE2902());
  service->start();
  BLEDevice::startAdvertising();
}
#endif

void setup() {
  Serial.begin(115200);
  pinMode(PIN_DRIVE, OUTPUT);
  pinMode(PIN_TURN, OUTPUT);
  pinMode(PIN_LOOK_YAW, OUTPUT);
  pinMode(PIN_LOOK_PITCH, OUTPUT);
#ifdef ESP32
  setupBle();
#endif
}

void loop() {
  while (Serial.available()) {
    handleByte((char)Serial.read());
  }
}

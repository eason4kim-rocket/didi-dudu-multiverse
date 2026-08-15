// BB-8 command bridge (ESP32 only). Reads one JSON line per tick from USB
// serial (115200) or Nordic UART BLE, then drives the real actuators listed
// in docs/hardware-spec.md:
//
//   - 2x drive wheels via a TB6612FNG        (drive)
//   - 1x continuous-rotation yaw servo       (turn)   [or a 3rd geared motor]
//   - 2x MG90S head servos                   (lookYaw / lookPitch)
//
// Frame (same fields as the sim's ControlState, so the browser page and the
// real robot speak one language):
//
//   {"drive":0.5,"turn":-0.2,"lookYaw":0.1,"lookPitch":0,"emote":1}
//
//   drive/turn : -1..1
//   lookYaw    : radians, +-0.70  (~+-40 deg, can't spin behind the head)
//   lookPitch  : radians, +-0.35  (~+-20 deg, positive looks up)
//   emote      : 0 none, 1 chirp, 2 excited, 3 curious, 4 yes, 5 no, 6 scared
//
// Needs: ESP32 Arduino core 3.x  +  the "ESP32Servo" library.
// This is bring-up firmware. Compile/upload from the Arduino IDE and bench
// test every actuator (wheels off the ground!) before sealing it in the ball.

#include <Arduino.h>
#include <ESP32Servo.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---- Pins (ESP32-WROOM-32; avoid input-only 34-39 and strapping 0/2/12/15) --
// TB6612FNG dual motor driver: each wheel = PWM speed pin + 2 direction pins.
static const int PIN_STBY = 32;  // TB6612 standby; HIGH = driver enabled
static const int PIN_PWMA = 25;  // left wheel speed  (drive)
static const int PIN_AIN1 = 27;
static const int PIN_AIN2 = 14;
static const int PIN_PWMB = 26;  // right wheel speed (drive)
static const int PIN_BIN1 = 33;
static const int PIN_BIN2 = 13;

static const int PIN_TURN = 4;         // chassis yaw: continuous-rotation servo
static const int PIN_LOOK_YAW = 18;    // MG90S
static const int PIN_LOOK_PITCH = 19;  // MG90S
static const int PIN_LED = 2;          // onboard LED, blips on an emote

// ---- Motor PWM (LEDC, core 3.x API) ----
static const int MOTOR_PWM_FREQ = 20000;  // 20 kHz: above hearing, gentle on TB6612
static const int MOTOR_PWM_BITS = 8;      // duty 0..255
static const int MOTOR_PWM_MAX = 255;

// ---- Servo ranges ----
static const int TURN_CENTER_US = 1500;   // continuous servo: 1500us = stop
static const int TURN_SPAN_US = 400;      // turn=+-1 -> 1100..1900us
static const float LOOK_YAW_RAD = 0.70f;  // maps to +-40 deg
static const float LOOK_PITCH_RAD = 0.35f;// maps to +-20 deg
static const float LOOK_YAW_DEG = 40.0f;
static const float LOOK_PITCH_DEG = 20.0f;

// ---- Safety ----
static const unsigned long CMD_TIMEOUT_MS = 500;  // stop the wheels if the link drops

static const char *NUS_SERVICE = "6e400001-b5a3-f393-e0a3-e24d89100fb4";
static const char *NUS_RX = "6e400002-b5a3-f393-e0a3-e24d89100fb4";
static const char *NUS_TX = "6e400003-b5a3-f393-e0a3-e24d89100fb4";

Servo turnServo;
Servo yawServo;
Servo pitchServo;

String line;

// Latest command targets; actuated once per loop() so a dropped link can be
// caught by the watchdog instead of leaving a motor running.
volatile float targetDrive = 0;
volatile float targetTurn = 0;
volatile float targetYaw = 0;
volatile float targetPitch = 0;
volatile int pendingEmote = 0;
unsigned long lastCommandMs = 0;
unsigned long emoteLedUntil = 0;

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

// Drive one TB6612 channel from a signed -1..1 value.
void driveMotor(int pwmPin, int in1, int in2, float value) {
  float v = constrain(value, -1.0f, 1.0f);
  int duty = (int)(fabs(v) * MOTOR_PWM_MAX);
  bool forward = v >= 0;
  digitalWrite(in1, forward ? HIGH : LOW);
  digitalWrite(in2, forward ? LOW : HIGH);
  ledcWrite(pwmPin, duty);
}

void applyDrive(float drive) {
  // Both wheels roll the same way for straight drive. If one wheel spins the
  // wrong way on the bench, swap that motor's two wires (or its IN pins).
  driveMotor(PIN_PWMA, PIN_AIN1, PIN_AIN2, drive);
  driveMotor(PIN_PWMB, PIN_BIN1, PIN_BIN2, drive);
}

void applyTurn(float turn) {
  int us = TURN_CENTER_US + (int)(constrain(turn, -1.0f, 1.0f) * TURN_SPAN_US);
  turnServo.writeMicroseconds(us);
}

void applyHead(float lookYaw, float lookPitch) {
  float y = constrain(lookYaw, -LOOK_YAW_RAD, LOOK_YAW_RAD) / LOOK_YAW_RAD;
  float p = constrain(lookPitch, -LOOK_PITCH_RAD, LOOK_PITCH_RAD) / LOOK_PITCH_RAD;
  yawServo.write((int)(90.0f + y * LOOK_YAW_DEG));
  pitchServo.write((int)(90.0f + p * LOOK_PITCH_DEG));
}

void applyCommand(const String &src) {
  targetDrive = extractFloat(src, "\"drive\"");
  targetTurn = extractFloat(src, "\"turn\"");
  targetYaw = extractFloat(src, "\"lookYaw\"");
  targetPitch = extractFloat(src, "\"lookPitch\"");
  int emote = extractInt(src, "\"emote\"");
  if (emote > 0) {
    pendingEmote = emote;
  }
  lastCommandMs = millis();
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

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    // .c_str() bridges both core versions (2.x std::string / 3.x String).
    String value = characteristic->getValue().c_str();
    for (size_t i = 0; i < value.length(); i++) {
      handleByte(value[i]);
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

void setup() {
  Serial.begin(115200);

  pinMode(PIN_STBY, OUTPUT);
  pinMode(PIN_AIN1, OUTPUT);
  pinMode(PIN_AIN2, OUTPUT);
  pinMode(PIN_BIN1, OUTPUT);
  pinMode(PIN_BIN2, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_STBY, HIGH);  // enable the TB6612

  // Motor PWM via LEDC.
  ledcAttach(PIN_PWMA, MOTOR_PWM_FREQ, MOTOR_PWM_BITS);
  ledcAttach(PIN_PWMB, MOTOR_PWM_FREQ, MOTOR_PWM_BITS);

  // All three servos run at 50 Hz and can share timers; reserve two for
  // ESP32Servo and leave the rest for the motor LEDC channels above. If the
  // head servos ever jitter, that's the LEDC timer sharing — try reserving
  // different timers here.
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  turnServo.setPeriodHertz(50);
  yawServo.setPeriodHertz(50);
  pitchServo.setPeriodHertz(50);
  turnServo.attach(PIN_TURN, 500, 2500);
  yawServo.attach(PIN_LOOK_YAW, 500, 2400);
  pitchServo.attach(PIN_LOOK_PITCH, 500, 2400);

  applyDrive(0);
  applyTurn(0);
  applyHead(0, 0);

  setupBle();
}

void loop() {
  while (Serial.available()) {
    handleByte((char)Serial.read());
  }

  // Failsafe: if commands stop arriving, halt the wheels. The head servos can
  // hold their last pose safely, so only the drive is zeroed.
  float drive = targetDrive;
  if (millis() - lastCommandMs > CMD_TIMEOUT_MS) {
    drive = 0;
  }

  applyDrive(drive);
  applyTurn(targetTurn);
  applyHead(targetYaw, targetPitch);

  // Emote feedback: blink the onboard LED. Swap for a passive buzzer or a
  // DFPlayer Mini later so it actually chirps.
  if (pendingEmote > 0) {
    emoteLedUntil = millis() + 120;
    Serial.print("emote ");
    Serial.println(pendingEmote);
    pendingEmote = 0;
  }
  digitalWrite(PIN_LED, millis() < emoteLedUntil ? HIGH : LOW);
}

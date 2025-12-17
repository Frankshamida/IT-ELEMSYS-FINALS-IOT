#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// Network and Firebase credentials
#define WIFI_SSID "Entice 4G"
#define WIFI_PASSWORD "Pot-Nami-Toffy@2025"

#define DATABASE_URL "https://it-elemsys-final-default-rtdb.asia-southeast1.firebasedatabase.app"
// For Firebase without authentication, we can send data without auth token

// Pin definitions for ESP32
#define LED_BUILTIN 2
#define DHTPIN 32
#define MQ135_PIN 35
#define DHTTYPE DHT11

#define STATUS_RED_LED 4
#define STATUS_GREEN_LED 5
#define LED_GOOD 15
#define LED_MODERATE 0
#define LED_UNHEALTHY 2
#define LED_HAZARDOUS 13
#define BUZZER_PIN 14
#define I2C_SDA 21
#define I2C_SCL 22

// MQ-135 Calibration
#define MQ135_RZERO 76.63
#define MQ135_RLOAD 10.0

// Create components
WebServer server(80);
DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Variables
unsigned long startTime;
float lastTemperature = 0;
float lastHumidity = 0;
float lastAirQuality = 0;
float lastCO2Estimate = 0;
int lastAnalogRaw = 0;
unsigned long lastSensorRead = 0;
const unsigned long sensorReadInterval = 2000;
bool dhtError = false;
bool mq135Error = false;
float mq135RZero = MQ135_RZERO;
unsigned long sensorWarmupStart = 0;
const unsigned long warmupTime = 30000;
bool isDeviceReady = false;
bool errorDetected = false;
bool phoneConnected = false;
unsigned long lastClientConnection = 0;
bool readyBeepPlayed = false;
bool firebaseConnected = false;
bool ledState = false;

// Timer variables
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 10000;

// LCD modes
enum LCDMode {
  LCD_WIFI_SETUP,
  LCD_PAIRING,
  LCD_CONNECTED,
  LCD_WELCOME,
  LCD_TEMPERATURE,
  LCD_HUMIDITY,
  LCD_AIR_QUALITY,
  LCD_CO2,
  LCD_ALL_DATA
};
LCDMode currentLCDMode = LCD_WIFI_SETUP;

// Function prototypes
float getPPMFromMQ135(int rawADC);
float estimateCO2(float ppm);
void updateLCD(LCDMode mode);
void updateAirQualityLEDs(float ppm);
void playReadyBeeps();
void updateStatusIndicators();
void readAllSensors();
String getStatusJSON();
void addCorsHeaders();
void sendDataToFirebase();
void handleLCDMode();
void handleCalibrateSensor();
void handleLEDControl();
void handleSystemControl();
void handleGetAllData();

// Function to calculate PPM from MQ-135
float getPPMFromMQ135(int rawADC) {
    if (rawADC <= 10 || rawADC >= 4090) return 0;
    
    float voltage = rawADC * (3.3 / 4095.0);
    float rs = ((3.3 - voltage) / voltage) * MQ135_RLOAD;
    float ratio = rs / mq135RZero;
    float ppm = 116.6020682 * pow(ratio, -2.769034857);
    
    if (ppm < 0) ppm = 0;
    if (ppm > 2000) ppm = 2000;
    
    return ppm;
}

// Function to estimate CO2 from PPM
float estimateCO2(float ppm) {
    return ppm * 0.7;
}

// Function to update LCD
void updateLCD(LCDMode mode) {
    lcd.clear();
    currentLCDMode = mode;
    
    switch(mode) {
        case LCD_WIFI_SETUP:
            lcd.setCursor(0, 0); lcd.print("Connecting WiFi");
            lcd.setCursor(0, 1); lcd.print(WIFI_SSID); break;
        case LCD_PAIRING:
            lcd.setCursor(0, 0); lcd.print("Pairing With");
            lcd.setCursor(0, 1); lcd.print("Your Phone..."); break;
        case LCD_CONNECTED:
            lcd.setCursor(0, 0); lcd.print("Device");
            lcd.setCursor(0, 1); lcd.print("Connected!"); break;
        case LCD_WELCOME:
            lcd.setCursor(0, 0); lcd.print("AirSentinel");
            lcd.setCursor(0, 1); lcd.print("Air Health System"); break;
        case LCD_TEMPERATURE:
            lcd.setCursor(0, 0); lcd.print("Temperature:");
            lcd.setCursor(0, 1); 
            if (dhtError) lcd.print("Error");
            else lcd.print(String(lastTemperature, 1) + " C"); break;
        case LCD_HUMIDITY:
            lcd.setCursor(0, 0); lcd.print("Humidity:");
            lcd.setCursor(0, 1);
            if (dhtError) lcd.print("Error");
            else lcd.print(String(lastHumidity, 1) + " %"); break;
        case LCD_AIR_QUALITY:
            lcd.setCursor(0, 0); lcd.print("Air Quality:");
            lcd.setCursor(0, 1);
            if (mq135Error) lcd.print("Error");
            else if ((millis() - sensorWarmupStart) < warmupTime) lcd.print("Warming up");
            else lcd.print(String(lastAirQuality, 0) + " PPM"); break;
        case LCD_CO2:
            lcd.setCursor(0, 0); lcd.print("CO2 Level:");
            lcd.setCursor(0, 1);
            if (mq135Error) lcd.print("Error");
            else if ((millis() - sensorWarmupStart) < warmupTime) lcd.print("Warming up");
            else lcd.print(String(lastCO2Estimate, 0) + " PPM"); break;
        case LCD_ALL_DATA:
            lcd.setCursor(0, 0);
            if (dhtError) lcd.print("T:Error H:Error");
            else {
                String line1 = "T:" + String(lastTemperature, 1) + " H:" + String(lastHumidity, 1);
                lcd.print(line1.substring(0, 16));
            }
            lcd.setCursor(0, 1);
            if (mq135Error) lcd.print("Air:Error");
            else if ((millis() - sensorWarmupStart) < warmupTime) lcd.print("Warming up");
            else {
                String line2 = "Air:" + String(lastAirQuality, 0) + " CO2:" + String(lastCO2Estimate, 0);
                lcd.print(line2.substring(0, 16));
            }
            break;
    }
}

// Update air quality LEDs
void updateAirQualityLEDs(float ppm) {
    digitalWrite(LED_GOOD, LOW);
    digitalWrite(LED_MODERATE, LOW);
    digitalWrite(LED_UNHEALTHY, LOW);
    digitalWrite(LED_HAZARDOUS, LOW);
    
    if (ppm <= 50) digitalWrite(LED_GOOD, HIGH);
    else if (ppm <= 100) digitalWrite(LED_MODERATE, HIGH);
    else if (ppm <= 200) digitalWrite(LED_UNHEALTHY, HIGH);
    else if (ppm > 200) digitalWrite(LED_HAZARDOUS, HIGH);
}

// Play ready beeps
void playReadyBeeps() {
    if (!readyBeepPlayed) {
        for(int i = 0; i < 2; i++) {
            digitalWrite(BUZZER_PIN, HIGH); delay(150);
            digitalWrite(BUZZER_PIN, LOW);
            if (i < 1) delay(100);
        }
        readyBeepPlayed = true;
    }
}

// Update status indicators
void updateStatusIndicators() {
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    bool allSensorsReady = !dhtError && !mq135Error && !isWarmingUp;
    
    if (dhtError || mq135Error) {
        digitalWrite(STATUS_RED_LED, HIGH);
        digitalWrite(STATUS_GREEN_LED, LOW);
        errorDetected = true;
        isDeviceReady = false;
        readyBeepPlayed = false;
        
        static bool errorBeepPlayed = false;
        if (!errorBeepPlayed) {
            for(int i = 0; i < 3; i++) {
                digitalWrite(BUZZER_PIN, HIGH); delay(100);
                digitalWrite(BUZZER_PIN, LOW); delay(100);
            }
            errorBeepPlayed = true;
        }
    } else if (isWarmingUp) {
        digitalWrite(STATUS_RED_LED, LOW);
        digitalWrite(STATUS_GREEN_LED, LOW);
        errorDetected = false;
        isDeviceReady = false;
        readyBeepPlayed = false;
    } else if (allSensorsReady) {
        digitalWrite(STATUS_RED_LED, LOW);
        digitalWrite(STATUS_GREEN_LED, HIGH);
        errorDetected = false;
        isDeviceReady = true;
        playReadyBeeps();
    }
}

// Read all sensors
void readAllSensors() {
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    int mq135Raw = analogRead(MQ135_PIN);
    
    if (isnan(temperature) || isnan(humidity)) {
        if (!dhtError) {
            Serial.println("❌ DHT11 Error!");
            dhtError = true;
        }
    } else {
        if (dhtError) {
            Serial.println("✅ DHT11 Reconnected");
            dhtError = false;
        }
        lastTemperature = temperature;
        lastHumidity = humidity;
    }
    
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    
    if (mq135Raw <= 10 || mq135Raw >= 4090) {
        if (!mq135Error) {
            Serial.println("❌ MQ-135 Hardware Error!");
            mq135Error = true;
        }
    } else {
        if (mq135Error) {
            Serial.println("✅ MQ-135 Reconnected");
            mq135Error = false;
        }
        
        lastAnalogRaw = mq135Raw;
        
        if (!isWarmingUp && !mq135Error) {
            lastAirQuality = getPPMFromMQ135(mq135Raw);
            lastCO2Estimate = estimateCO2(lastAirQuality);
            updateAirQualityLEDs(lastAirQuality);
        } else {
            lastAirQuality = 0;
            lastCO2Estimate = 0;
        }
    }
    
    updateStatusIndicators();
}

// Get status as JSON
String getStatusJSON() {
    JsonDocument doc;
    
    doc["wifiStatus"] = WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected";
    if (WiFi.status() == WL_CONNECTED) {
        doc["ipAddress"] = WiFi.localIP().toString();
        doc["ssid"] = WIFI_SSID;
        doc["rssi"] = WiFi.RSSI();
    }
    
    doc["firebaseStatus"] = firebaseConnected ? "Connected" : "Connecting";
    doc["phoneConnected"] = phoneConnected;
    
    unsigned long uptime = millis() - startTime;
    char uptimeStr[12];
    sprintf(uptimeStr, "%02d:%02d:%02d", uptime/3600000, (uptime%3600000)/60000, (uptime%60000)/1000);
    doc["uptime"] = uptimeStr;
    
    doc["freeHeap"] = String(ESP.getFreeHeap() / 1024) + " KB";
    doc["ledState"] = digitalRead(LED_BUILTIN) ? "ON" : "OFF";
    doc["deviceReady"] = isDeviceReady;
    doc["errorDetected"] = errorDetected;
    
    if (dhtError) {
        doc["temperature"] = "Error";
        doc["humidity"] = "Error";
    } else {
        doc["temperature"] = String(lastTemperature, 1);
        doc["humidity"] = String(lastHumidity, 1);
    }
    
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    
    if (mq135Error) {
        doc["airQuality"] = "Hardware Error";
        doc["co2Estimate"] = "Check Wiring";
        doc["analogRaw"] = lastAnalogRaw;
    } else if (isWarmingUp) {
        int remaining = (warmupTime - (millis() - sensorWarmupStart)) / 1000;
        doc["airQuality"] = "Warming up";
        doc["co2Estimate"] = String(remaining) + "s";
        doc["analogRaw"] = lastAnalogRaw;
    } else {
        doc["airQuality"] = String(lastAirQuality, 0);
        doc["co2Estimate"] = String(lastCO2Estimate, 0);
        doc["analogRaw"] = lastAnalogRaw;
    }
    
    String sensorStatus = "All OK";
    if (isWarmingUp) sensorStatus = "Warming up (" + String((warmupTime - (millis() - sensorWarmupStart)) / 1000) + "s)";
    if (dhtError && mq135Error) sensorStatus = "All Sensors Error";
    else if (dhtError) sensorStatus = "DHT11 Error";
    else if (mq135Error) sensorStatus = "MQ-135 Hardware Error";
    doc["sensorStatus"] = sensorStatus;
    
    unsigned long currentMillis = millis();
    char timeStr[12];
    sprintf(timeStr, "%02d:%02d:%02d", (currentMillis/3600000)%24, (currentMillis%3600000)/60000, (currentMillis%60000)/1000);
    doc["readingTime"] = String(timeStr);
    
    String response;
    serializeJson(doc, response);
    return response;
}

// FIXED: Send data to Firebase using HTTP REST API
void sendDataToFirebase() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi not connected, skipping Firebase send...");
        return;
    }
    
    HTTPClient http;
    
    // Generate a unique timestamp for the data node
    unsigned long timestamp = millis();
    String path = String(DATABASE_URL) + "/sensor_readings.json"; // Changed path
    
    Serial.println("Sending to Firebase: " + path);
    Serial.println("WiFi connected: " + String(WiFi.status() == WL_CONNECTED));
    
    // Create JSON payload
    JsonDocument doc;
    
    if (!dhtError) {
        doc["temperature"] = lastTemperature;
        doc["humidity"] = lastHumidity;
    } else {
        doc["temperature"] = 0;
        doc["humidity"] = 0;
    }
    
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    if (!mq135Error && !isWarmingUp) {
        doc["air_quality"] = lastAirQuality;
        doc["co2"] = lastCO2Estimate;
    } else {
        doc["air_quality"] = 0;
        doc["co2"] = 0;
    }
    
    doc["analog_raw"] = lastAnalogRaw;
    doc["device_ready"] = isDeviceReady;
    doc["error"] = errorDetected;
    doc["timestamp"] = timestamp;
    doc["ledState"] = digitalRead(LED_BUILTIN) ? "ON" : "OFF";
    
    String jsonStr;
    serializeJson(doc, jsonStr);
    
    Serial.println("JSON Payload: " + jsonStr);
    
    http.begin(path);
    http.addHeader("Content-Type", "application/json");
    
    // Use POST instead of PUT for writing data
    int httpResponseCode = http.POST(jsonStr);
    
    if (httpResponseCode > 0) {
        firebaseConnected = true;
        Serial.print("✅ Firebase response code: ");
        Serial.println(httpResponseCode);
        
        // Print response body for debugging
        String response = http.getString();
        Serial.println("Firebase response: " + response);
    } else {
        firebaseConnected = false;
        Serial.print("❌ Firebase error: ");
        Serial.println(httpResponseCode);
        Serial.println("Error: " + http.errorToString(httpResponseCode));
    }
    
    http.end();
}

// Add CORS headers
void addCorsHeaders() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    server.sendHeader("Access-Control-Allow-Credentials", "true");
}

// Handle LCD mode change
void handleLCDMode() {
    addCorsHeaders();
    
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, body);
        
        if (!error) {
            String mode = doc["mode"].as<String>();
            
            if (mode == "welcome") currentLCDMode = LCD_WELCOME;
            else if (mode == "temperature") currentLCDMode = LCD_TEMPERATURE;
            else if (mode == "humidity") currentLCDMode = LCD_HUMIDITY;
            else if (mode == "airquality") currentLCDMode = LCD_AIR_QUALITY;
            else if (mode == "co2") currentLCDMode = LCD_CO2;
            else if (mode == "alldata") currentLCDMode = LCD_ALL_DATA;
            
            updateLCD(currentLCDMode);
            
            String response = "{\"status\":\"success\",\"mode\":\"" + mode + "\"}";
            server.send(200, "application/json", response);
            Serial.println("📱 LCD Mode changed to: " + mode);
        } else {
            server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid JSON\"}");
        }
    } else {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"No data\"}");
    }
    
    lastClientConnection = millis();
}

// Handle sensor calibration
void handleCalibrateSensor() {
    addCorsHeaders();
    
    Serial.println("🔄 Starting MQ-135 calibration...");
    
    // Turn on status LED to indicate calibration
    digitalWrite(STATUS_GREEN_LED, HIGH);
    digitalWrite(STATUS_RED_LED, LOW);
    
    // Update LCD
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Calibrating...");
    lcd.setCursor(0, 1); lcd.print("Clean air needed");
    
    // Take multiple readings for better calibration
    int readings = 0;
    float sum = 0;
    
    for (int i = 0; i < 30; i++) {
        int raw = analogRead(MQ135_PIN);
        if (raw > 10 && raw < 4090) {
            float voltage = raw * (3.3 / 4095.0);
            float rs = ((3.3 - voltage) / voltage) * MQ135_RLOAD;
            sum += rs;
            readings++;
        }
        
        // Blink LED
        digitalWrite(STATUS_GREEN_LED, i % 2);
        delay(1000);
    }
    
    if (readings > 0) {
        mq135RZero = sum / readings;
        Serial.print("✅ New RZero: ");
        Serial.println(mq135RZero);
        
        // Play success beep
        for(int i = 0; i < 2; i++) {
            digitalWrite(BUZZER_PIN, HIGH); delay(200);
            digitalWrite(BUZZER_PIN, LOW); delay(100);
        }
        
        String response = "{\"status\":\"success\",\"message\":\"Calibration complete\",\"rZero\":" + String(mq135RZero, 2) + "}";
        server.send(200, "application/json", response);
    } else {
        String response = "{\"status\":\"error\",\"message\":\"Calibration failed - no valid readings\"}";
        server.send(500, "application/json", response);
    }
    
    digitalWrite(STATUS_GREEN_LED, LOW);
    lastClientConnection = millis();
}

// Handle LED control
void handleLEDControl() {
    addCorsHeaders();
    
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, body);
        
        if (!error) {
            String action = doc["action"].as<String>();
            
            if (action == "toggle") {
                digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
                ledState = digitalRead(LED_BUILTIN);
            } else if (action == "on") {
                digitalWrite(LED_BUILTIN, HIGH);
                ledState = true;
            } else if (action == "off") {
                digitalWrite(LED_BUILTIN, LOW);
                ledState = false;
            }
            
            String response = "{\"status\":\"success\",\"ledState\":\"" + String(ledState ? "ON" : "OFF") + "\"}";
            server.send(200, "application/json", response);
            Serial.println("💡 LED state: " + String(ledState ? "ON" : "OFF"));
        }
    } else {
        // Default to toggle if no body
        digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
        ledState = digitalRead(LED_BUILTIN);
        String response = "{\"status\":\"success\",\"ledState\":\"" + String(ledState ? "ON" : "OFF") + "\"}";
        server.send(200, "application/json", response);
    }
    
    lastClientConnection = millis();
}

// Handle system controls
void handleSystemControl() {
    addCorsHeaders();
    
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, body);
        
        if (!error) {
            String command = doc["command"].as<String>();
            
            if (command == "restart") {
                server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Restarting...\"}");
                delay(100);
                ESP.restart();
            } else if (command == "wifi_reset") {
                WiFi.disconnect();
                delay(1000);
                WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
                server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"WiFi reset\"}");
            } else if (command == "beep") {
                digitalWrite(BUZZER_PIN, HIGH);
                delay(100);
                digitalWrite(BUZZER_PIN, LOW);
                server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Beep played\"}");
            } else {
                server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Unknown command\"}");
            }
        }
    }
    
    lastClientConnection = millis();
}

// Handle complete data request
void handleGetAllData() {
    addCorsHeaders();
    
    JsonDocument doc;
    
    // Sensor data
    if (!dhtError) {
        doc["temperature"] = String(lastTemperature, 1);
        doc["humidity"] = String(lastHumidity, 1);
    } else {
        doc["temperature"] = "Error";
        doc["humidity"] = "Error";
    }
    
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    if (!mq135Error && !isWarmingUp) {
        doc["airQuality"] = String(lastAirQuality, 0);
        doc["co2"] = String(lastCO2Estimate, 0);
    } else if (isWarmingUp) {
        int remaining = (warmupTime - (millis() - sensorWarmupStart)) / 1000;
        doc["airQuality"] = "Warming up";
        doc["co2"] = String(remaining) + "s remaining";
    } else {
        doc["airQuality"] = "Error";
        doc["co2"] = "Error";
    }
    
    // System info
    doc["analogRaw"] = lastAnalogRaw;
    doc["deviceReady"] = isDeviceReady;
    doc["errorDetected"] = errorDetected;
    doc["ledState"] = digitalRead(LED_BUILTIN) ? "ON" : "OFF";
    doc["wifiStatus"] = WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected";
    doc["ipAddress"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["firebaseStatus"] = firebaseConnected ? "Connected" : "Disconnected";
    
    // Uptime
    unsigned long uptime = millis() - startTime;
    char uptimeStr[12];
    sprintf(uptimeStr, "%02d:%02d:%02d", uptime/3600000, (uptime%3600000)/60000, (uptime%60000)/1000);
    doc["uptime"] = String(uptimeStr);
    doc["freeHeap"] = String(ESP.getFreeHeap() / 1024) + " KB";
    
    // Current LCD mode
    String lcdModeStr;
    switch(currentLCDMode) {
        case LCD_WELCOME: lcdModeStr = "welcome"; break;
        case LCD_TEMPERATURE: lcdModeStr = "temperature"; break;
        case LCD_HUMIDITY: lcdModeStr = "humidity"; break;
        case LCD_AIR_QUALITY: lcdModeStr = "airquality"; break;
        case LCD_CO2: lcdModeStr = "co2"; break;
        case LCD_ALL_DATA: lcdModeStr = "alldata"; break;
        default: lcdModeStr = "welcome";
    }
    doc["lcdMode"] = lcdModeStr;
    
    // Timestamp
    doc["timestamp"] = millis();
    unsigned long currentMillis = millis();
    char timeStr[12];
    sprintf(timeStr, "%02d:%02d:%02d", (currentMillis/3600000)%24, (currentMillis%3600000)/60000, (currentMillis%60000)/1000);
    doc["time"] = String(timeStr);
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
    
    lastClientConnection = millis();
}

void setup() {
    Serial.begin(115200);
    delay(2000);
    
    Serial.println("\n=== AirSentinel ESP32 System ===");
    Serial.println("Initializing...");
    
    // Initialize pins
    pinMode(LED_BUILTIN, OUTPUT);
    pinMode(STATUS_RED_LED, OUTPUT);
    pinMode(STATUS_GREEN_LED, OUTPUT);
    pinMode(LED_GOOD, OUTPUT);
    pinMode(LED_MODERATE, OUTPUT);
    pinMode(LED_UNHEALTHY, OUTPUT);
    pinMode(LED_HAZARDOUS, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    
    digitalWrite(LED_BUILTIN, LOW);
    digitalWrite(STATUS_RED_LED, LOW);
    digitalWrite(STATUS_GREEN_LED, LOW);
    digitalWrite(LED_GOOD, LOW);
    digitalWrite(LED_MODERATE, LOW);
    digitalWrite(LED_UNHEALTHY, LOW);
    digitalWrite(LED_HAZARDOUS, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    
    // Initialize sensors
    dht.begin();
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    
    // Initialize LCD
    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init();
    lcd.backlight();
    updateLCD(LCD_WIFI_SETUP);
    
    // Record start times
    sensorWarmupStart = millis();
    startTime = millis();
    
    // Connect to WiFi
    Serial.println("Connecting to WiFi: " + String(WIFI_SSID));
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int wifiTimeout = 30;
    while (WiFi.status() != WL_CONNECTED && wifiTimeout > 0) {
        Serial.print(".");
        delay(500);
        wifiTimeout--;
        digitalWrite(STATUS_GREEN_LED, !digitalRead(STATUS_GREEN_LED));
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✅ WiFi Connected!");
        Serial.println("IP: " + WiFi.localIP().toString());
        digitalWrite(STATUS_GREEN_LED, HIGH);
        updateLCD(LCD_CONNECTED);
        delay(2000);
        updateLCD(LCD_WELCOME);
    } else {
        Serial.println("\n❌ WiFi Connection Failed!");
        digitalWrite(STATUS_RED_LED, HIGH);
        updateLCD(LCD_WIFI_SETUP);
    }
    
    // Setup API routes
    server.on("/", HTTP_OPTIONS, []() {
        addCorsHeaders();
        server.send(200);
    });
    
    server.on("/api/status", HTTP_GET, []() {
        addCorsHeaders();
        server.send(200, "application/json", getStatusJSON());
        lastClientConnection = millis();
        phoneConnected = true;
    });
    
    server.on("/api/led/toggle", HTTP_POST, []() {
        addCorsHeaders();
        digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
        String response = "{\"status\":\"success\",\"ledState\":\"" + String(digitalRead(LED_BUILTIN) ? "ON" : "OFF") + "\"}";
        server.send(200, "application/json", response);
        lastClientConnection = millis();
    });
    
    server.on("/api/refresh", HTTP_POST, []() {
        addCorsHeaders();
        readAllSensors();
        server.send(200, "application/json", getStatusJSON());
        lastClientConnection = millis();
    });
    
    server.on("/api/firebase/test", HTTP_POST, []() {
        addCorsHeaders();
        sendDataToFirebase();
        server.send(200, "application/json", "{\"status\":\"sent\"}");
        lastClientConnection = millis();
    });
    
    server.on("/api/info", HTTP_GET, []() {
        addCorsHeaders();
        String response = "{";
        response += "\"device\":\"AirSentinel ESP32\",";
        response += "\"version\":\"2.0.0\",";
        response += "\"wifiMode\":\"Client\",";
        response += "\"firebaseStatus\":\"" + String(firebaseConnected ? "Connected" : "Connecting") + "\",";
        response += "\"ip\":\"" + WiFi.localIP().toString() + "\"";
        response += "}";
        server.send(200, "application/json", response);
        lastClientConnection = millis();
    });
    
    // NEW API ENDPOINTS
    server.on("/api/lcd", HTTP_POST, handleLCDMode);
    server.on("/api/calibrate", HTTP_POST, handleCalibrateSensor);
    server.on("/api/led/control", HTTP_POST, handleLEDControl);
    server.on("/api/system/control", HTTP_POST, handleSystemControl);
    server.on("/api/data/all", HTTP_GET, handleGetAllData);
    
    // Start server
    server.begin();
    Serial.println("🌐 API Server started on port 80");
    
    // Print all available endpoints
    Serial.println("\n📡 Available API Endpoints:");
    Serial.println("  GET  /api/status       - Get device status");
    Serial.println("  POST /api/led/toggle   - Toggle built-in LED");
    Serial.println("  POST /api/refresh      - Force sensor refresh");
    Serial.println("  POST /api/firebase/test- Test Firebase connection");
    Serial.println("  GET  /api/info         - Get device info");
    Serial.println("  POST /api/lcd          - Change LCD mode");
    Serial.println("  POST /api/calibrate    - Calibrate MQ-135 sensor");
    Serial.println("  POST /api/led/control  - Control LED (toggle/on/off)");
    Serial.println("  POST /api/system/control- System controls (restart, etc)");
    Serial.println("  GET  /api/data/all     - Get all sensor data");
    
    // Ready
    digitalWrite(LED_BUILTIN, HIGH);
    delay(500);
    digitalWrite(LED_BUILTIN, LOW);
    
    Serial.println("\n✅ System Ready!");
    Serial.println("Waiting for sensor warmup (30 seconds)...");
}

void loop() {
    server.handleClient();
    
    // Read sensors
    if (millis() - lastSensorRead >= sensorReadInterval) {
        readAllSensors();
        lastSensorRead = millis();
    }
    
    // Send to Firebase every 10 seconds
    if (WiFi.status() == WL_CONNECTED && (millis() - lastSendTime >= sendInterval)) {
        Serial.println("\n📤 Sending data to Firebase...");
        lastSendTime = millis();
        sendDataToFirebase();
    }
    
    // Update LCD
    static unsigned long lastLCDUpdate = 0;
    if (millis() - lastLCDUpdate >= 5000) {
        if (currentLCDMode >= LCD_TEMPERATURE && currentLCDMode <= LCD_ALL_DATA) {
            updateLCD(currentLCDMode);
        }
        lastLCDUpdate = millis();
    }

    // NEW: Check for Firebase commands
    handleFirebaseCommands();
    
    // Print status
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint >= 10000) {
        if (!dhtError && !mq135Error) {
            Serial.print("🌡️ Temp: ");
            Serial.print(lastTemperature, 1);
            Serial.print("°C | 💧 Hum: ");
            Serial.print(lastHumidity, 1);
            Serial.print("% | Air: ");
            Serial.print(lastAirQuality, 0);
            Serial.print(" PPM | CO₂: ");
            Serial.print(lastCO2Estimate, 0);
            Serial.print(" PPM | Firebase: ");
            Serial.println(firebaseConnected ? "Connected ✅" : "Connecting ⏳");
        }
        lastPrint = millis();
    }
    
    // Check WiFi connection
    static unsigned long lastWifiCheck = 0;
    if (millis() - lastWifiCheck >= 30000) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("WiFi disconnected! Reconnecting...");
            WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        }
        lastWifiCheck = millis();
    }
    
    // Blink LED if warming up
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    if (isWarmingUp && !dhtError && !mq135Error) {
        static unsigned long lastBlink = 0;
        if (millis() - lastBlink >= 500) {
            digitalWrite(STATUS_GREEN_LED, !digitalRead(STATUS_GREEN_LED));
            lastBlink = millis();
        }
    }
    
    // Check for inactive clients
    if (millis() - lastClientConnection > 60000) {
        phoneConnected = false;
    }
}

// Add this function to your Arduino code
void handleFirebaseCommands() {
    static unsigned long lastCheck = 0;
    
    // Check for commands every 5 seconds
    if (millis() - lastCheck < 5000) return;
    lastCheck = millis();
    
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    
    // Check for LCD commands
    String path = String(DATABASE_URL) + "/lcd_commands.json";
    http.begin(path);
    
    int httpCode = http.GET();
    
    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error && doc.is<JsonObject>()) {
            JsonObject obj = doc.as<JsonObject>();
            
            for (JsonPair kv : obj) {
                JsonObject command = kv.value().as<JsonObject>();
                
                // Check if command hasn't been processed
                if (!command.containsKey("processed") || !command["processed"]) {
                    String mode = command["mode"].as<String>();
                    
                    // Process the LCD command
                    if (mode == "welcome") currentLCDMode = LCD_WELCOME;
                    else if (mode == "temperature") currentLCDMode = LCD_TEMPERATURE;
                    else if (mode == "humidity") currentLCDMode = LCD_HUMIDITY;
                    else if (mode == "airquality") currentLCDMode = LCD_AIR_QUALITY;
                    else if (mode == "co2") currentLCDMode = LCD_CO2;
                    else if (mode == "alldata") currentLCDMode = LCD_ALL_DATA;
                    
                    updateLCD(currentLCDMode);
                    Serial.println("📱 LCD Mode changed from Firebase: " + mode);
                    
                    // Mark command as processed
                    String commandPath = String(DATABASE_URL) + "/lcd_commands/" + kv.key().c_str() + "/processed.json";
                    HTTPClient http2;
                    http2.begin(commandPath);
                    http2.PUT("true");
                    http2.end();
                }
            }
        }
    }
    
    http.end();
}
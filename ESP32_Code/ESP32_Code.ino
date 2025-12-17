#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// WiFi Access Point credentials
const char* ssid = "AirSentinel";      // Name of the ESP32 hotspot
const char* password = "1234567890";   // Password (8 characters minimum)

// Pin definitions for ESP32
#define LED_BUILTIN 2      // Built-in LED on GPIO2
#define DHTPIN 32          // DHT11 connected to GPIO32
#define MQ135_PIN 35       // MQ-135 connected to GPIO35 - ANALOG INPUT
#define DHTTYPE DHT11      // DHT 11

// Status LEDs
#define STATUS_RED_LED 4   // Red LED for errors
#define STATUS_GREEN_LED 5 // Green LED for ready

// Air Quality Indicator LEDs
#define LED_GOOD 15        // Green LED for good air
#define LED_MODERATE 0     // Yellow LED for moderate
#define LED_UNHEALTHY 2    // Red LED for unhealthy
#define LED_HAZARDOUS 13   // Red LED for hazardous

// Buzzer
#define BUZZER_PIN 14      // Buzzer

// LCD (I2C Interface)
#define I2C_SDA 21         // I2C SDA
#define I2C_SCL 22         // I2C SCL
LiquidCrystal_I2C lcd(0x27, 16, 2); // Default I2C address 0x27, 16x2 LCD

// MQ-135 Calibration values
#define MQ135_RZERO 76.63  // Resistance in clean air
#define MQ135_RLOAD 10.0   // Load resistance in KOhms

// Create web server on port 80
WebServer server(80);

// Initialize DHT sensor
DHT dht(DHTPIN, DHTTYPE);

// Variables for sensor data
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
const unsigned long warmupTime = 30000; // 30 seconds in milliseconds
bool isDeviceReady = false;
bool errorDetected = false;
bool phoneConnected = false;
unsigned long lastClientConnection = 0;
bool readyBeepPlayed = false;

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
void checkClientConnection();
void readAllSensors();
String getStatusJSON();

// Add CORS headers for Vercel frontend
void addCorsHeaders() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    server.sendHeader("Access-Control-Allow-Credentials", "true");
}

// Function to calculate PPM from MQ-135
float getPPMFromMQ135(int rawADC) {
    if (rawADC <= 10 || rawADC >= 4090) {
        return 0; // Invalid reading
    }
    
    // Convert ADC value to voltage (0-3.3V)
    float voltage = rawADC * (3.3 / 4095.0);
    
    // Calculate RS (Sensor Resistance)
    float rs = ((3.3 - voltage) / voltage) * MQ135_RLOAD;
    
    // Calculate ratio RS/R0
    float ratio = rs / mq135RZero;
    
    // Simplified PPM calculation for MQ-135
    float ppm = 116.6020682 * pow(ratio, -2.769034857);
    
    // Clamp to reasonable values
    if (ppm < 0) ppm = 0;
    if (ppm > 2000) ppm = 2000;
    
    return ppm;
}

// Function to estimate CO2 from PPM
float estimateCO2(float ppm) {
    return ppm * 0.7; // Rough estimate
}

// Function to update LCD display based on mode
void updateLCD(LCDMode mode) {
    lcd.clear();
    currentLCDMode = mode;
    
    switch(mode) {
        case LCD_WIFI_SETUP:
            lcd.setCursor(0, 0);
            lcd.print("Connect WiFi:");
            lcd.setCursor(0, 1);
            lcd.print("SSID: AirSentinel");
            break;
            
        case LCD_PAIRING:
            lcd.setCursor(0, 0);
            lcd.print("Pairing With");
            lcd.setCursor(0, 1);
            lcd.print("Your Phone...");
            break;
            
        case LCD_CONNECTED:
            lcd.setCursor(0, 0);
            lcd.print("Device");
            lcd.setCursor(0, 1);
            lcd.print("Connected!");
            break;
            
        case LCD_WELCOME:
            lcd.setCursor(0, 0);
            lcd.print("AirSentinel");
            lcd.setCursor(0, 1);
            lcd.print("Air Health System");
            break;
            
        case LCD_TEMPERATURE:
            lcd.setCursor(0, 0);
            lcd.print("Temperature:");
            lcd.setCursor(0, 1);
            if (dhtError) {
                lcd.print("Error");
            } else {
                lcd.print(String(lastTemperature, 1) + " C");
            }
            break;
            
        case LCD_HUMIDITY:
            lcd.setCursor(0, 0);
            lcd.print("Humidity:");
            lcd.setCursor(0, 1);
            if (dhtError) {
                lcd.print("Error");
            } else {
                lcd.print(String(lastHumidity, 1) + " %");
            }
            break;
            
        case LCD_AIR_QUALITY:
            lcd.setCursor(0, 0);
            lcd.print("Air Quality:");
            lcd.setCursor(0, 1);
            if (mq135Error) {
                lcd.print("Error");
            } else if ((millis() - sensorWarmupStart) < warmupTime) {
                lcd.print("Warming up");
            } else {
                lcd.print(String(lastAirQuality, 0) + " PPM");
            }
            break;
            
        case LCD_CO2:
            lcd.setCursor(0, 0);
            lcd.print("CO2 Level:");
            lcd.setCursor(0, 1);
            if (mq135Error) {
                lcd.print("Error");
            } else if ((millis() - sensorWarmupStart) < warmupTime) {
                lcd.print("Warming up");
            } else {
                lcd.print(String(lastCO2Estimate, 0) + " PPM");
            }
            break;
            
        case LCD_ALL_DATA:
            lcd.setCursor(0, 0);
            if (dhtError) {
                lcd.print("T:Error H:Error");
            } else {
                String line1 = "T:" + String(lastTemperature, 1) + " H:" + String(lastHumidity, 1);
                lcd.print(line1.substring(0, 16));
            }
            
            lcd.setCursor(0, 1);
            if (mq135Error) {
                lcd.print("Air:Error");
            } else if ((millis() - sensorWarmupStart) < warmupTime) {
                lcd.print("Warming up");
            } else {
                String line2 = "Air:" + String(lastAirQuality, 0) + " CO2:" + String(lastCO2Estimate, 0);
                lcd.print(line2.substring(0, 16));
            }
            break;
    }
}

// Function to update LED indicators based on air quality
void updateAirQualityLEDs(float ppm) {
    // Turn off all air quality LEDs first
    digitalWrite(LED_GOOD, LOW);
    digitalWrite(LED_MODERATE, LOW);
    digitalWrite(LED_UNHEALTHY, LOW);
    digitalWrite(LED_HAZARDOUS, LOW);
    
    if (ppm <= 50) {
        // Good air quality
        digitalWrite(LED_GOOD, HIGH);
    } else if (ppm <= 100) {
        // Moderate air quality
        digitalWrite(LED_MODERATE, HIGH);
    } else if (ppm <= 200) {
        // Unhealthy air quality
        digitalWrite(LED_UNHEALTHY, HIGH);
    } else if (ppm > 200) {
        // Hazardous air quality
        digitalWrite(LED_HAZARDOUS, HIGH);
    }
}

// Function to play 2 beeps for device ready
void playReadyBeeps() {
    if (!readyBeepPlayed) {
        // Play 2 short beeps
        for(int i = 0; i < 2; i++) {
            digitalWrite(BUZZER_PIN, HIGH);
            delay(150);
            digitalWrite(BUZZER_PIN, LOW);
            if (i < 1) delay(100); // Short pause between beeps
        }
        readyBeepPlayed = true;
    }
}

// Function to update status LEDs and buzzer
void updateStatusIndicators() {
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    bool allSensorsReady = !dhtError && !mq135Error && !isWarmingUp;
    
    if (dhtError || mq135Error) {
        // Error state
        digitalWrite(STATUS_RED_LED, HIGH);
        digitalWrite(STATUS_GREEN_LED, LOW);
        errorDetected = true;
        isDeviceReady = false;
        readyBeepPlayed = false;
        
        // Sound buzzer for error (3 short beeps)
        for(int i = 0; i < 3; i++) {
            digitalWrite(BUZZER_PIN, HIGH);
            delay(100);
            digitalWrite(BUZZER_PIN, LOW);
            delay(100);
        }
    } else if (isWarmingUp) {
        // Warming up state
        digitalWrite(STATUS_RED_LED, LOW);
        digitalWrite(STATUS_GREEN_LED, LOW);
        errorDetected = false;
        isDeviceReady = false;
        readyBeepPlayed = false;
    } else if (allSensorsReady) {
        // Ready state
        digitalWrite(STATUS_RED_LED, LOW);
        digitalWrite(STATUS_GREEN_LED, HIGH);
        errorDetected = false;
        isDeviceReady = true;
        playReadyBeeps();
    }
}

// Function to read all sensors
void readAllSensors() {
    // Read DHT11
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    
    // Read MQ-135
    int mq135Raw = analogRead(MQ135_PIN);
    
    // Check for sensor errors
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
    
    // Check if sensor is still warming up
    bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
    
    // Check for MQ-135 errors
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
        
        // Only calculate PPM if sensor is warmed up
        if (!isWarmingUp && !mq135Error) {
            lastAirQuality = getPPMFromMQ135(mq135Raw);
            lastCO2Estimate = estimateCO2(lastAirQuality);
            
            // Update air quality LEDs
            updateAirQualityLEDs(lastAirQuality);
        } else {
            lastAirQuality = 0;
            lastCO2Estimate = 0;
        }
    }
    
    // Update status indicators
    updateStatusIndicators();
}

// Get status as JSON
String getStatusJSON() {
    StaticJsonDocument<1024> doc;
    
    // WiFi status
    doc["wifiStatus"] = "Access Point";
    doc["ipAddress"] = WiFi.softAPIP().toString();
    doc["ssid"] = ssid;
    
    // Connection status
    doc["phoneConnected"] = phoneConnected;
    doc["connectedClients"] = WiFi.softAPgetStationNum();
    
    // Uptime
    unsigned long uptime = millis() - startTime;
    int hours = uptime / 3600000;
    int minutes = (uptime % 3600000) / 60000;
    int seconds = (uptime % 60000) / 1000;
    char uptimeStr[12];
    sprintf(uptimeStr, "%02d:%02d:%02d", hours, minutes, seconds);
    doc["uptime"] = uptimeStr;
    
    // Memory
    doc["freeHeap"] = String(ESP.getFreeHeap() / 1024) + " KB";
    
    // LED state
    doc["ledState"] = digitalRead(LED_BUILTIN) ? "ON" : "OFF";
    
    // Device status
    doc["deviceReady"] = isDeviceReady;
    doc["errorDetected"] = errorDetected;
    
    // Sensor readings with error handling
    if (dhtError) {
        doc["temperature"] = "Error";
        doc["humidity"] = "Error";
    } else {
        doc["temperature"] = String(lastTemperature, 1);
        doc["humidity"] = String(lastHumidity, 1);
    }
    
    // Check if sensor is warming up
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
    
    // Sensor status summary
    String sensorStatus = "All OK";
    if (isWarmingUp) sensorStatus = "Warming up (" + String((warmupTime - (millis() - sensorWarmupStart)) / 1000) + "s)";
    if (dhtError && mq135Error) sensorStatus = "All Sensors Error";
    else if (dhtError) sensorStatus = "DHT11 Error";
    else if (mq135Error) sensorStatus = "MQ-135 Hardware Error";
    doc["sensorStatus"] = sensorStatus;
    
    // Reading time
    unsigned long currentMillis = millis();
    int readHours = (currentMillis / 3600000) % 24;
    int readMinutes = (currentMillis % 3600000) / 60000;
    int readSeconds = (currentMillis % 60000) / 1000;
    char timeStr[12];
    sprintf(timeStr, "%02d:%02d:%02d", readHours, readMinutes, readSeconds);
    doc["readingTime"] = String(timeStr);
    
    String response;
    serializeJson(doc, response);
    return response;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // Initialize pins
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(STATUS_RED_LED, OUTPUT);
  pinMode(STATUS_GREEN_LED, OUTPUT);
  pinMode(LED_GOOD, OUTPUT);
  pinMode(LED_MODERATE, OUTPUT);
  pinMode(LED_UNHEALTHY, OUTPUT);
  pinMode(LED_HAZARDOUS, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Turn off all LEDs initially
  digitalWrite(LED_BUILTIN, LOW);
  digitalWrite(STATUS_RED_LED, LOW);
  digitalWrite(STATUS_GREEN_LED, LOW);
  digitalWrite(LED_GOOD, LOW);
  digitalWrite(LED_MODERATE, LOW);
  digitalWrite(LED_UNHEALTHY, LOW);
  digitalWrite(LED_HAZARDOUS, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  
  // Initialize DHT sensor
  dht.begin();
  
  // Initialize MQ-135 (analog input)
  analogReadResolution(12); // Set to 12-bit resolution (0-4095)
  analogSetAttenuation(ADC_11db); // Allow up to 3.3V
  
  // Initialize I2C for LCD
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();
  
  // Show WiFi setup message on LCD
  updateLCD(LCD_WIFI_SETUP);
  
  // Record warmup start time
  sensorWarmupStart = millis();
  startTime = millis();
  
  Serial.println("\n=== AirSentinel API Server ===");
  Serial.println("DHT11: GPIO32 | MQ-135: GPIO35");
  Serial.println("LCD: I2C SDA:GPIO21 SCL:GPIO22");
  Serial.println("Status LEDs: Red:GPIO4 Green:GPIO5");
  Serial.println("Air Quality LEDs: GPIO15,0,2,13");
  Serial.println("Buzzer: GPIO14");
  Serial.println("==========================================");
  Serial.println("Creating WiFi Access Point...");
  
  // Create WiFi Access Point
  WiFi.softAP(ssid, password);
  
  // Get IP address
  IPAddress IP = WiFi.softAPIP();
  
  Serial.println("\n✅ WiFi Access Point Created!");
  Serial.print("📡 SSID: ");
  Serial.println(ssid);
  Serial.print("🔐 Password: ");
  Serial.println(password);
  Serial.print("🌐 IP Address: ");
  Serial.println(IP);
  Serial.println("📱 Connect to this WiFi network");
  Serial.println("   and open your Vercel dashboard");
  Serial.println("==========================================");
  
  // Handle CORS preflight requests
  server.on("/", HTTP_OPTIONS, []() {
    addCorsHeaders();
    server.send(200);
  });
  
  // API Routes
  server.on("/api/status", HTTP_GET, []() {
    addCorsHeaders();
    String status = getStatusJSON();
    server.send(200, "application/json", status);
    lastClientConnection = millis();
  });
  
  server.on("/api/led/toggle", HTTP_POST, []() {
    addCorsHeaders();
    
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    String state = digitalRead(LED_BUILTIN) ? "ON" : "OFF";
    
    StaticJsonDocument<128> doc;
    doc["status"] = "success";
    doc["ledState"] = state;
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
    lastClientConnection = millis();
  });
  
  server.on("/api/refresh", HTTP_POST, []() {
    addCorsHeaders();
    readAllSensors();
    String status = getStatusJSON();
    server.send(200, "application/json", status);
    lastClientConnection = millis();
  });
  
  server.on("/api/calibrate", HTTP_POST, []() {
    addCorsHeaders();
    
    // Start calibration
    Serial.println("Starting MQ-135 calibration (30 seconds)...");
    
    StaticJsonDocument<256> doc;
    doc["status"] = "calibrating";
    doc["message"] = "Calibration started (30 seconds)";
    doc["baseline"] = String(mq135RZero, 2);
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
    lastClientConnection = millis();
    
    // In a real implementation, you would start calibration in background
    // For now, we just return the current baseline
  });
  
  server.on("/api/lcd", HTTP_POST, []() {
    addCorsHeaders();
    
    // Parse JSON body
    StaticJsonDocument<256> requestDoc;
    DeserializationError error = deserializeJson(requestDoc, server.arg("plain"));
    
    if (error) {
      server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }
    
    String mode = requestDoc["mode"];
    LCDMode lcdMode = LCD_WELCOME;
    
    // Map mode string to LCDMode enum
    if (mode == "welcome") lcdMode = LCD_WELCOME;
    else if (mode == "temperature") lcdMode = LCD_TEMPERATURE;
    else if (mode == "humidity") lcdMode = LCD_HUMIDITY;
    else if (mode == "airquality") lcdMode = LCD_AIR_QUALITY;
    else if (mode == "co2") lcdMode = LCD_CO2;
    else if (mode == "alldata") lcdMode = LCD_ALL_DATA;
    
    updateLCD(lcdMode);
    
    StaticJsonDocument<128> responseDoc;
    responseDoc["status"] = "success";
    responseDoc["mode"] = mode;
    
    String response;
    serializeJson(responseDoc, response);
    server.send(200, "application/json", response);
    lastClientConnection = millis();
  });
  
  server.on("/api/info", HTTP_GET, []() {
    addCorsHeaders();
    
    StaticJsonDocument<512> doc;
    doc["device"] = "AirSentinel ESP32";
    doc["version"] = "1.0.0";
    doc["ssid"] = ssid;
    doc["password"] = password;
    doc["ip"] = WiFi.softAPIP().toString();
    doc["endpoints"] = "/api/status, /api/led/toggle, /api/calibrate, /api/lcd, /api/refresh";
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
    lastClientConnection = millis();
  });
  
  // Start server
  server.begin();
  Serial.println("🌐 API Server started on port 80");
  Serial.println("✅ Ready for connections!");
  
  // Turn on built-in LED to show system is ready
  digitalWrite(LED_BUILTIN, HIGH);
}

void loop() {
  server.handleClient();
  
  // Read sensors every 2 seconds
  if (millis() - lastSensorRead >= sensorReadInterval) {
    readAllSensors();
    lastSensorRead = millis();
  }
  
  // Update LCD every 5 seconds to show sensor data
  static unsigned long lastLCDUpdate = 0;
  if (millis() - lastLCDUpdate >= 5000) {
    if (currentLCDMode >= LCD_TEMPERATURE && currentLCDMode <= LCD_ALL_DATA) {
      updateLCD(currentLCDMode);
    }
    lastLCDUpdate = millis();
  }
  
  // Handle warming up indicator (blinking green LED)
  bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
  if (isWarmingUp && !dhtError && !mq135Error) {
    static unsigned long lastBlink = 0;
    if (millis() - lastBlink >= 500) { // Blink every 500ms
      digitalWrite(STATUS_GREEN_LED, !digitalRead(STATUS_GREEN_LED));
      lastBlink = millis();
    }
  }
  
  // Print sensor data every 10 seconds
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
      Serial.print(" PPM | Clients: ");
      Serial.println(WiFi.softAPgetStationNum());
    }
    lastPrint = millis();
  }
}
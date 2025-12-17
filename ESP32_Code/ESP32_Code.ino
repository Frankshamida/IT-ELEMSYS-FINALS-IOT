#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>

// WiFi Access Point credentials
const char* ssid = "AirSentinel";    // Name of the ESP32 hotspot
const char* password = "1234567890";    // Password (8 characters minimum)

// Pin definitions for ESP32 based on your pinout
#define LED_BUILTIN 2      // Built-in LED on GPIO2 (Pin 24)
#define DHTPIN 32          // DHT11 connected to GPIO32 (Pin 7)
#define MQ135_PIN 35       // MQ-135 connected to GPIO35 (Pin 6) - ANALOG INPUT
#define DHTTYPE DHT11      // DHT 11

// Status LEDs
#define STATUS_RED_LED 4   // Red LED for errors (Pin 26 - ADC10/TOUCH0)
#define STATUS_GREEN_LED 5 // Green LED for ready (Pin 29 - SPI SS)

// Air Quality Indicator LEDs
#define LED_GOOD 15        // Green LED for good air (Pin 23 - ADC13/TOUCH3)
#define LED_MODERATE 0     // Yellow LED for moderate (Pin 25 - ADC11/TOUCH1)
#define LED_UNHEALTHY 2    // Red LED for unhealthy (Pin 24 - ADC12/TOUCH2)
#define LED_HAZARDOUS 13   // Red LED for hazardous (Pin 15 - ADC14/TOUCH4)

// Buzzer
#define BUZZER_PIN 14      // Buzzer (Pin 12 - TOUCH6/ADC16)

// LCD (I2C Interface)
#define I2C_SDA 21         // I2C SDA (Pin 33)
#define I2C_SCL 22         // I2C SCL (Pin 36)
LiquidCrystal_I2C lcd(0x27, 16, 2); // Default I2C address 0x27, 16x2 LCD

// MQ-135 Calibration values
#define MQ135_RZERO 76.63  // Resistance in clean air
#define MQ135_RLOAD 10.0   // Load resistance in KOhms

// Create web server on port 80
WebServer server(80);

// Initialize DHT sensor
DHT dht(DHTPIN, DHTTYPE);

// Variables for LCD display modes
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
LCDMode lastUserLCDMode = LCD_WELCOME; // Remember user's last choice
unsigned long lastLCDUpdate = 0;
const unsigned long LCD_UPDATE_INTERVAL = 2000;

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
const unsigned long warmupTime = 30000; // 30 seconds in milliseconds for warmup
bool isDeviceReady = false;
bool errorDetected = false;
bool phoneConnected = false;
unsigned long lastClientConnection = 0;
const unsigned long connectionTimeout = 10000; // 10 seconds timeout
bool connectionBeepPlayed = false;
bool readyBeepPlayed = false;

// Function prototypes
float getPPMFromMQ135(int rawADC);
float estimateCO2(float ppm);
void updateLCD();
void updateAirQualityLEDs(float ppm);
void playReadyBeeps();
void updateStatusIndicators();
void checkClientConnection();
void readAllSensors();
String getStatusJSON();
void updateCurrentChart();

// Function to calculate PPM from MQ-135
float getPPMFromMQ135(int rawADC) {
    if (rawADC <= 10 || rawADC >= 4090) {
        return 0; // Invalid reading
    }
    
    // Convert ADC value to voltage (0-3.3V)
    float voltage = rawADC * (3.3 / 4095.0);
    
    // Calculate RS (Sensor Resistance)
    // Using voltage divider formula: Vout = Vin * (RL / (RS + RL))
    // RS = RL * (Vin - Vout) / Vout
    float rs = ((3.3 - voltage) / voltage) * MQ135_RLOAD;
    
    // Calculate ratio RS/R0
    float ratio = rs / mq135RZero;
    
    // Simplified PPM calculation for MQ-135
    // This is an approximation - MQ-135 detects multiple gases
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
void updateLCD() {
    lcd.clear();
    
    switch(currentLCDMode) {
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
            lcd.print("Successfully Connected");
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
        digitalWrite(STATUS_GREEN_LED, LOW); // Blinking will be handled in loop
        errorDetected = false;
        isDeviceReady = false;
        readyBeepPlayed = false;
    } else if (allSensorsReady) {
        // Ready state - only 2 beeps when first ready
        digitalWrite(STATUS_RED_LED, LOW);
        digitalWrite(STATUS_GREEN_LED, HIGH);
        errorDetected = false;
        isDeviceReady = true;
        
        playReadyBeeps();
    }
}

// Function to check if client is connected
void checkClientConnection() {
    static unsigned long lastClientCheck = 0;
    
    if (millis() - lastClientCheck > 1000) { // Check every second
        int clients = WiFi.softAPgetStationNum();
        
        if (clients > 0) {
            // Client is connected
            if (!phoneConnected) {
                // New connection
                phoneConnected = true;
                lastClientConnection = millis();
                
                // Update LCD to pairing mode
                if (currentLCDMode == LCD_WIFI_SETUP) {
                    currentLCDMode = LCD_PAIRING;
                    updateLCD();
                    
                    // Show pairing for 3 seconds, then switch to connected
                    delay(3000);
                    currentLCDMode = LCD_CONNECTED;
                    updateLCD();
                    
                    // Show connected for 3 seconds, then switch to user's last mode
                    delay(3000);
                    currentLCDMode = lastUserLCDMode;
                    updateLCD();
                }
                
                // Play connection beep
                if (!connectionBeepPlayed) {
                    for(int i = 0; i < 2; i++) {
                        digitalWrite(BUZZER_PIN, HIGH);
                        delay(200);
                        digitalWrite(BUZZER_PIN, LOW);
                        if (i < 1) delay(150);
                    }
                    connectionBeepPlayed = true;
                }
            }
            lastClientConnection = millis();
        } else {
            // No clients connected
            if (phoneConnected) {
                phoneConnected = false;
                connectionBeepPlayed = false;
                
                // Switch LCD back to WiFi setup mode
                currentLCDMode = LCD_WIFI_SETUP;
                updateLCD();
            }
        }
        
        lastClientCheck = millis();
    }
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
  currentLCDMode = LCD_WIFI_SETUP;
  updateLCD();
  
  // Record warmup start time
  sensorWarmupStart = millis();
  startTime = millis();
  
  Serial.println("\n=== Sentinel Air Quality Monitor with AI ===");
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
  Serial.println("📱 Connect your phone to this WiFi network");
  Serial.println("   and open browser to: http://" + IP.toString());
  
  digitalWrite(LED_BUILTIN, HIGH);
  
  // Read initial sensor values
  readAllSensors();
  
  // Configure web server routes
  server.on("/", []() {
    server.send(200, "text/html", "Please load index.html from the filesystem");
    lastClientConnection = millis();
  });
  
  server.on("/index.html", []() {
    server.send(200, "text/html", "Please load index.html from the filesystem");
    lastClientConnection = millis();
  });
  
  server.on("/script.js", []() {
    server.send(200, "application/javascript", "Please load script.js from the filesystem");
    lastClientConnection = millis();
  });
  
  server.on("/led/toggle", []() {
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    String state = digitalRead(LED_BUILTIN) ? "ON" : "OFF";
    server.send(200, "text/plain", state);
    lastClientConnection = millis();
  });
  
  server.on("/refresh", []() {
    readAllSensors();
    String status = getStatusJSON();
    server.send(200, "application/json", status);
    lastClientConnection = millis();
  });
  
  server.on("/calibrate", []() {
    // Calibrate MQ-135 in clean air - 30 seconds
    Serial.println("Starting MQ-135 calibration (30 seconds)...");
    float sum = 0;
    int readings = 0;
    
    // Blink status LEDs during calibration
    for(int i = 0; i < 60; i++) { // 60 * 500ms = 30 seconds
      digitalWrite(STATUS_RED_LED, !digitalRead(STATUS_RED_LED));
      digitalWrite(STATUS_GREEN_LED, !digitalRead(STATUS_GREEN_LED));
      int raw = analogRead(MQ135_PIN);
      if (raw > 100 && raw < 4000) {
        float voltage = raw * (3.3 / 4095.0);
        float rs = ((3.3 - voltage) / voltage) * MQ135_RLOAD;
        sum += rs;
        readings++;
        if (i % 10 == 0) { // Print every 5 seconds
          Serial.print("Calibration progress: ");
          Serial.print(i/2);
          Serial.print("/30 seconds | Readings: ");
          Serial.println(readings);
        }
      }
      delay(500); // 500ms delay = 2 readings per second
    }
    
    digitalWrite(STATUS_RED_LED, LOW);
    digitalWrite(STATUS_GREEN_LED, HIGH); // Turn green LED on after calibration
    
    if (readings > 20) {
      mq135RZero = sum / readings;
      Serial.print("Calibration complete! New R0: ");
      Serial.println(mq135RZero, 2);
      String response = "{\"baseline\":\"" + String(mq135RZero, 2) + "\"}";
      server.send(200, "application/json", response);
    } else {
      Serial.println("Calibration failed - not enough valid readings");
      server.send(500, "application/json", "{\"error\":\"Calibration failed - check sensor connection\"}");
    }
    lastClientConnection = millis();
  });
  
  server.on("/status", []() {
    String status = getStatusJSON();
    server.send(200, "application/json", status);
    lastClientConnection = millis();
  });
  
  // LCD control routes
  server.on("/lcd/welcome", []() {
    lastUserLCDMode = LCD_WELCOME;
    currentLCDMode = LCD_WELCOME;
    updateLCD();
    server.send(200, "text/plain", "LCD set to Welcome Screen");
    lastClientConnection = millis();
  });
  
  server.on("/lcd/temperature", []() {
    lastUserLCDMode = LCD_TEMPERATURE;
    currentLCDMode = LCD_TEMPERATURE;
    updateLCD();
    server.send(200, "text/plain", "LCD set to Temperature");
    lastClientConnection = millis();
  });
  
  server.on("/lcd/humidity", []() {
    lastUserLCDMode = LCD_HUMIDITY;
    currentLCDMode = LCD_HUMIDITY;
    updateLCD();
    server.send(200, "text/plain", "LCD set to Humidity");
    lastClientConnection = millis();
  });
  
  server.on("/lcd/airquality", []() {
    lastUserLCDMode = LCD_AIR_QUALITY;
    currentLCDMode = LCD_AIR_QUALITY;
    updateLCD();
    server.send(200, "text/plain", "LCD set to Air Quality");
    lastClientConnection = millis();
  });
  
  server.on("/lcd/co2", []() {
    lastUserLCDMode = LCD_CO2;
    currentLCDMode = LCD_CO2;
    updateLCD();
    server.send(200, "text/plain", "LCD set to CO2 Level");
    lastClientConnection = millis();
  });
  
  server.on("/lcd/alldata", []() {
    lastUserLCDMode = LCD_ALL_DATA;
    currentLCDMode = LCD_ALL_DATA;
    updateLCD();
    server.send(200, "text/plain", "LCD set to All Data");
    lastClientConnection = millis();
  });
  
  server.on("/debug", []() {
    int raw = analogRead(MQ135_PIN);
    float voltage = raw * (3.3 / 4095.0);
    float rs = ((3.3 - voltage) / voltage) * MQ135_RLOAD;
    float ratio = rs / mq135RZero;
    float ppm = 116.6020682 * pow(ratio, -2.769034857);
    
    String debug = "{";
    debug += "\"rawADC\":\"" + String(raw) + "\",";
    debug += "\"voltage\":\"" + String(voltage, 3) + "\",";
    debug += "\"RS\":\"" + String(rs, 2) + "\",";
    debug += "\"ratio\":\"" + String(ratio, 4) + "\",";
    debug += "\"calculatedPPM\":\"" + String(ppm, 0) + "\",";
    debug += "\"warmup\":\"" + String((millis() - sensorWarmupStart) / 1000) + "s\",";
    debug += "\"R0\":\"" + String(mq135RZero, 2) + "\",";
    debug += "\"lcdMode\":\"" + String(currentLCDMode) + "\",";
    debug += "\"deviceReady\":\"" + String(isDeviceReady ? "Yes" : "No") + "\",";
    debug += "\"error\":\"" + String(errorDetected ? "Yes" : "No") + "\",";
    debug += "\"phoneConnected\":\"" + String(phoneConnected ? "Yes" : "No") + "\",";
    debug += "\"connectedClients\":\"" + String(WiFi.softAPgetStationNum()) + "\"";
    debug += "}";
    server.send(200, "application/json", debug);
    lastClientConnection = millis();
  });
  
  // Start web server
  server.begin();
  Serial.println("🌐 HTTP server started");
  Serial.println("==========================================");
}

void loop() {
  server.handleClient();
  
  // Check client connection
  checkClientConnection();
  
  // Read sensors every 2 seconds
  if (millis() - lastSensorRead >= sensorReadInterval) {
    readAllSensors();
    lastSensorRead = millis();
  }
  
  // Update LCD every 2 seconds
  if (millis() - lastLCDUpdate >= LCD_UPDATE_INTERVAL) {
    updateLCD();
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
}

void readAllSensors() {
  // Read DHT11
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  
  // Read MQ-135
  int mq135Raw = analogRead(MQ135_PIN);
  float airQuality = 0;
  float co2Estimate = 0;
  
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
  
  // Check if sensor is still warming up (30 seconds)
  bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
  
  // Check for MQ-135 errors
  if (mq135Raw <= 10 || mq135Raw >= 4090) {
    // Invalid reading (disconnected or shorted)
    if (!mq135Error) {
      Serial.println("❌ MQ-135 Hardware Error! Check connections.");
      Serial.print("Raw ADC: ");
      Serial.println(mq135Raw);
      mq135Error = true;
    }
  } else {
    // Valid reading range
    if (mq135Error) {
      Serial.println("✅ MQ-135 Reconnected");
      mq135Error = false;
    }
    
    lastAnalogRaw = mq135Raw;
    
    // Only calculate PPM if sensor is warmed up
    if (!isWarmingUp && !mq135Error) {
      airQuality = getPPMFromMQ135(mq135Raw);
      co2Estimate = estimateCO2(airQuality);
      lastAirQuality = airQuality;
      lastCO2Estimate = co2Estimate;
      
      // Update air quality LEDs
      updateAirQualityLEDs(airQuality);
    } else {
      // During warmup or error, show appropriate values
      lastAirQuality = 0;
      lastCO2Estimate = 0;
    }
  }
  
  // Update status indicators (LEDs and buzzer)
  updateStatusIndicators();
  
  // Print sensor debug info every 30 seconds
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 30000) {
    if (isWarmingUp) {
      int remaining = (warmupTime - (millis() - sensorWarmupStart)) / 1000;
      Serial.print("MQ-135 Warming up... ");
      Serial.print(remaining);
      Serial.println(" seconds remaining");
    } else if (mq135Error) {
      Serial.println("❌ MQ-135 Error - Check wiring!");
    } else {
      float voltage = mq135Raw * (3.3 / 4095.0);
      Serial.print("🌡️ Temp: ");
      Serial.print(temperature, 1);
      Serial.print("°C | 💧 Hum: ");
      Serial.print(humidity, 1);
      Serial.print("% | MQ-135: ");
      Serial.print("ADC=");
      Serial.print(mq135Raw);
      Serial.print(" (");
      Serial.print(voltage, 3);
      Serial.print("V) | PPM: ");
      Serial.print(lastAirQuality, 0);
      Serial.print(" | LEDs: ");
      Serial.print(digitalRead(LED_GOOD) ? "Good " : "");
      Serial.print(digitalRead(LED_MODERATE) ? "Moderate " : "");
      Serial.print(digitalRead(LED_UNHEALTHY) ? "Unhealthy " : "");
      Serial.print(digitalRead(LED_HAZARDOUS) ? "Hazardous " : "");
      Serial.print(" | Phone: ");
      Serial.print(phoneConnected ? "Connected" : "Disconnected");
      Serial.println();
    }
    lastPrint = millis();
  }
}

String getStatusJSON() {
  String status = "{";
  
  // WiFi status
  status += "\"wifiStatus\":\"Access Point\",";
  status += "\"ipAddress\":\"" + WiFi.softAPIP().toString() + "\",";
  
  // WiFi signal strength
  status += "\"wifiRSSI\":\"-30 dBm (AP Mode)\",";
  
  // Connection status
  status += "\"phoneConnected\":\"" + String(phoneConnected ? "Yes" : "No") + "\",";
  status += "\"connectedClients\":\"" + String(WiFi.softAPgetStationNum()) + "\",";
  
  // Uptime
  unsigned long uptime = millis() - startTime;
  int hours = uptime / 3600000;
  int minutes = (uptime % 3600000) / 60000;
  int seconds = (uptime % 60000) / 1000;
  char uptimeStr[12];
  sprintf(uptimeStr, "%02d:%02d:%02d", hours, minutes, seconds);
  status += "\"uptime\":\"" + String(uptimeStr) + "\",";
  
  // Memory
  status += "\"freeHeap\":\"" + String(ESP.getFreeHeap() / 1024) + " KB\",";
  
  // LED state
  String ledState = digitalRead(LED_BUILTIN) ? "ON" : "OFF";
  status += "\"ledState\":\"" + ledState + "\",";
  
  // Status LEDs state
  status += "\"statusRedLED\":\"" + String(digitalRead(STATUS_RED_LED) ? "ON" : "OFF") + "\",";
  status += "\"statusGreenLED\":\"" + String(digitalRead(STATUS_GREEN_LED) ? "ON" : "OFF") + "\",";
  
  // Air Quality LEDs state
  status += "\"ledGood\":\"" + String(digitalRead(LED_GOOD) ? "ON" : "OFF") + "\",";
  status += "\"ledModerate\":\"" + String(digitalRead(LED_MODERATE) ? "ON" : "OFF") + "\",";
  status += "\"ledUnhealthy\":\"" + String(digitalRead(LED_UNHEALTHY) ? "ON" : "OFF") + "\",";
  status += "\"ledHazardous\":\"" + String(digitalRead(LED_HAZARDOUS) ? "ON" : "OFF") + "\",";
  
  // Device status
  status += "\"deviceReady\":\"" + String(isDeviceReady ? "Yes" : "No") + "\",";
  status += "\"errorDetected\":\"" + String(errorDetected ? "Yes" : "No") + "\",";
  status += "\"lcdMode\":\"" + String(currentLCDMode) + "\",";
  
  // Sensor readings with error handling
  if (dhtError) {
    status += "\"temperature\":\"Error\",";
    status += "\"humidity\":\"Error\",";
  } else {
    status += "\"temperature\":\"" + String(lastTemperature, 1) + "\",";
    status += "\"humidity\":\"" + String(lastHumidity, 1) + "\",";
  }
  
  // Check if sensor is warming up (30 seconds)
  bool isWarmingUp = (millis() - sensorWarmupStart) < warmupTime;
  
  if (mq135Error) {
    status += "\"airQuality\":\"Hardware Error\",";
    status += "\"co2Estimate\":\"Check Wiring\",";
    status += "\"analogRaw\":\"" + String(lastAnalogRaw) + "\",";
  } else if (isWarmingUp) {
    int remaining = (warmupTime - (millis() - sensorWarmupStart)) / 1000;
    status += "\"airQuality\":\"Warming up\",";
    status += "\"co2Estimate\":\"" + String(remaining) + "s\",";
    status += "\"analogRaw\":\"" + String(lastAnalogRaw) + "\",";
  } else {
    status += "\"airQuality\":\"" + String(lastAirQuality, 0) + "\",";
    status += "\"co2Estimate\":\"" + String(lastCO2Estimate, 0) + "\",";
    status += "\"analogRaw\":\"" + String(lastAnalogRaw) + "\",";
  }
  
  // Sensor status summary
  String sensorStatus = "All OK";
  if (isWarmingUp) sensorStatus = "Warming up (" + String((warmupTime - (millis() - sensorWarmupStart)) / 1000) + "s)";
  if (dhtError && mq135Error) sensorStatus = "All Sensors Error";
  else if (dhtError) sensorStatus = "DHT11 Error";
  else if (mq135Error) sensorStatus = "MQ-135 Hardware Error";
  status += "\"sensorStatus\":\"" + sensorStatus + "\",";
  
  // Reading time
  unsigned long currentMillis = millis();
  int readHours = (currentMillis / 3600000) % 24;
  int readMinutes = (currentMillis % 3600000) / 60000;
  int readSeconds = (currentMillis % 60000) / 1000;
  char timeStr[12];
  sprintf(timeStr, "%02d:%02d:%02d", readHours, readMinutes, readSeconds);
  status += "\"readingTime\":\"" + String(timeStr) + "\"";
  
  status += "}";
  
  return status;
}
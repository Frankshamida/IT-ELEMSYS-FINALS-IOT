# AirSentinel - ESP32 Air Quality Monitor

## 🌍 Complete Setup Guide for Vercel Deployment

This project connects an ESP32 microcontroller to a web-based dashboard hosted on Vercel.

---

## 📋 Table of Contents

1. [Hardware Setup](#hardware-setup)
2. [Arduino Code Upload](#arduino-code-upload)
3. [Website Deployment](#website-deployment)
4. [Connection Methods](#connection-methods)
5. [Troubleshooting](#troubleshooting)

---

## 🔧 Hardware Setup

### Required Components

- ESP32 Development Board
- DHT11 Humidity & Temperature Sensor
- MQ-135 Air Quality Sensor
- 16x2 I2C LCD Display
- 4x Status LEDs (Red, Green, Yellow, Red)
- 1x Buzzer
- Jumper Wires

### Pin Configuration

| Component                 | GPIO Pin |
| ------------------------- | -------- |
| DHT11 (Data)              | GPIO32   |
| MQ-135 (Analog)           | GPIO35   |
| I2C SDA (LCD)             | GPIO21   |
| I2C SCL (LCD)             | GPIO22   |
| Status Red LED            | GPIO4    |
| Status Green LED          | GPIO5    |
| Air Good LED (Green)      | GPIO15   |
| Air Moderate LED (Yellow) | GPIO0    |
| Air Unhealthy LED (Red)   | GPIO2    |
| Air Hazardous LED (Red)   | GPIO13   |
| Buzzer                    | GPIO14   |
| Built-in LED              | GPIO2    |

### Wiring Connections

```
ESP32                 Sensor
GND        ------>    GND
3.3V       ------>    VCC

DHT11:
GPIO32     ------>    DATA
GND        ------>    GND
3.3V       ------>    VCC

MQ-135:
GPIO35 (ADC) ----->   AOUT
GND        ------>    GND
5V         ------>    VCC

I2C LCD (0x27):
GPIO21     ------>    SDA
GPIO22     ------>    SCL
GND        ------>    GND
5V         ------>    VCC
```

---

## 📤 Arduino Code Upload

### Step 1: Install Arduino IDE & ESP32 Board Support

1. Download [Arduino IDE](https://www.arduino.cc/en/software)
2. Open Arduino IDE
3. Go to **File → Preferences**
4. Add to "Additional Boards Manager URLs":
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
5. Go to **Tools → Board → Boards Manager**
6. Search for "esp32" and install "ESP32 by Espressif Systems"

### Step 2: Install Required Libraries

Go to **Sketch → Include Library → Manage Libraries** and install:

- `DHT sensor library` by Adafruit
- `ArduinoJson` by Benoit Blanchon
- `LiquidCrystal_I2C` by Frank de Brabander

### Step 3: Upload the Code

1. Copy the Arduino code from `ESP32_Code/ESP32_Code.ino`
2. Open Arduino IDE and paste the code
3. Select **Tools → Board → esp32 → ESP32 Dev Module**
4. Select the correct **COM Port**
5. Click **Upload**
6. Monitor the serial output at **Tools → Serial Monitor** (115200 baud)

### Expected Output

```
=== AirSentinel API Server ===
DHT11: GPIO32 | MQ-135: GPIO35
LCD: I2C SDA:GPIO21 SCL:GPIO22
Status LEDs: Red:GPIO4 Green:GPIO5
Air Quality LEDs: GPIO15,0,2,13
Buzzer: GPIO14
==========================================
Creating WiFi Access Point...

✅ WiFi Access Point Created!
📡 SSID: AirSentinel
🔐 Password: 1234567890
🌐 IP Address: 192.168.4.1
```

---

## 🚀 Website Deployment

### Option 1: Deploy to Vercel (Recommended)

#### Prerequisites

- GitHub account
- Vercel account (free)

#### Steps

1. **Create a GitHub Repository**

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/IT-ELEMSYS-IOT.git
   git push -u origin main
   ```

2. **Import to Vercel**

   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select "Other" as the framework
   - Deploy

3. **Your site will be live at**
   ```
   https://your-project.vercel.app
   ```

### Option 2: Local Testing

```bash
# Using Python (Python 3)
python -m http.server 8000

# Using Node.js with http-server
npx http-server

# Then visit http://localhost:8000
```

---

## 🌐 Connection Methods

Your AirSentinel dashboard supports **TWO connection modes**:

### 🟢 Connection Mode 1: Local WiFi (Fastest)

**Best for:** Same home/office network

**How it works:**

1. ESP32 creates a WiFi Access Point (Hotspot)
2. Your device connects to "AirSentinel" network
3. Dashboard directly communicates with ESP32 at `192.168.4.1`
4. **No cloud, ultra-low latency**

**Setup:**

- Phone/Laptop: Connect to WiFi "AirSentinel" (Password: 1234567890)
- Open: http://192.168.4.1 OR https://your-project.vercel.app
- Click Settings gear icon → Device IP: 192.168.4.1
- Connection Mode: **Local**

### 🔵 Connection Mode 2: Cloud Proxy (Remote Access)

**Best for:** Remote monitoring, internet access

**How it works:**

1. Your Vercel website sends requests to cloud proxy
2. Cloud proxy forwards them to your ESP32
3. ESP32 sends responses back through the cloud
4. **Works from anywhere, slight delay**

**Setup:**

- No need to be on ESP32's WiFi
- Open: https://your-project.vercel.app (from any network)
- Click Settings gear icon → Connection Mode: **Cloud**
- Device IP: Enter your ESP32's local network IP

### ⚙️ Connection Mode 3: Auto-Detect (Recommended)

**How it works:**

1. Tries local connection first
2. Falls back to cloud proxy if local fails
3. Automatically adapts to your situation

**Setup:**

- Connection Mode: **Auto**
- Automatically handles switching

---

## 📱 Quick Start Guide

### For First Time Use

1. **Power on your ESP32**

   - Check serial monitor for confirmation
   - Should show "✅ Ready for connections!"

2. **Connect to WiFi**

   - Network: `AirSentinel`
   - Password: `1234567890`

3. **Open Dashboard**

   - Local: `http://192.168.4.1`
   - Remote: `https://your-project.vercel.app`

4. **Configure Connection**

   - Click ⚙️ Settings icon
   - Select your Connection Mode
   - Enter Device IP: `192.168.4.1`
   - Click "Test Connection"

5. **View Data**
   - Temperature, Humidity, Air Quality
   - Real-time charts and AI recommendations
   - Control LED and LCD display

---

## 🔧 Advanced Configuration

### Change WiFi Credentials

Edit the Arduino code:

```cpp
const char* ssid = "YourNewNetwork";
const char* password = "YourNewPassword";
```

Upload to ESP32.

### Change Device IP

The default IP is `192.168.4.1`. To find your ESP32's actual IP:

- Check serial monitor output
- Or use network scanner app

### Modify Sensor Calibration

Edit in Arduino code:

```cpp
#define MQ135_RZERO 76.63  // Change this value
#define MQ135_RLOAD 10.0
```

---

## 🐛 Troubleshooting

### ❌ "Device not found"

**Solution 1: Local Connection**

1. Ensure you're connected to "AirSentinel" WiFi
2. Check ESP32 is powered on
3. Click Settings → Test Connection
4. Verify IP address (usually 192.168.4.1)

**Solution 2: Cloud Connection**

1. Ensure device is connected to internet (any WiFi)
2. Ensure Vercel app is deployed and running
3. Enter correct local device IP in settings
4. Check ESP32 serial monitor for errors

### ❌ "DHT11 Error"

- Check sensor wiring on GPIO32
- Verify sensor is not defective
- Try resetting ESP32

### ❌ "MQ-135 Error"

- Check sensor wiring on GPIO35
- Wait 30 seconds for warmup
- Verify GPIO35 is not already in use

### ❌ "LCD not displaying"

- Check I2C address (default: 0x27)
- Verify SDA (GPIO21) and SCL (GPIO22) connections
- Use I2C scanner to confirm address

### ❌ Website won't load

- Check internet connection
- Verify Vercel deployment is active
- Clear browser cache and hard refresh (Ctrl+Shift+R)

### ❌ API calls fail

- Check device IP is correct
- Verify CORS headers are enabled
- Check firewall settings
- Try Cloud Proxy mode instead

---

## 📊 API Endpoints

Your ESP32 provides these endpoints:

| Endpoint          | Method | Purpose                 |
| ----------------- | ------ | ----------------------- |
| `/api/status`     | GET    | Get all sensor readings |
| `/api/led/toggle` | POST   | Toggle built-in LED     |
| `/api/refresh`    | POST   | Force sensor refresh    |
| `/api/calibrate`  | POST   | Calibrate MQ-135        |
| `/api/lcd`        | POST   | Control LCD display     |
| `/api/info`       | GET    | Device information      |

### Example API Call (Local)

```bash
curl http://192.168.4.1/api/status
```

### Example API Call (Cloud)

```bash
curl "https://your-project.vercel.app/api/esp32-proxy?endpoint=/api/status&deviceIp=192.168.4.1"
```

---

## 📝 File Structure

```
IT-ELEMSYS-IOT/
├── index.html              # Main dashboard HTML
├── style.css               # Dashboard styles
├── script.js               # Dashboard logic
├── manifest.json           # PWA manifest
├── vercel.json             # Vercel config
├── api/
│   ├── data.js            # Sensor data storage
│   └── esp32-proxy.js     # Cloud proxy endpoint
└── ESP32_Code/
    └── ESP32_Code.ino     # Arduino firmware
```

---

## 🎯 Key Features

✅ **Real-time Monitoring**

- Temperature, Humidity, Air Quality
- CO2 estimation
- Live status updates

✅ **Dual Connection Modes**

- Local WiFi for fast response
- Cloud proxy for remote access

✅ **Interactive Dashboard**

- Historical charts
- Air quality gauge
- AI recommendations
- Device controls

✅ **Hardware Integration**

- Status LEDs (connected/errors)
- Air quality LEDs (visual indicator)
- Buzzer alerts
- LCD display control

✅ **Progressive Web App**

- Install as app
- Offline support (partial)
- Mobile responsive

---

## 📞 Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review serial monitor output on ESP32
3. Check browser console (F12) for errors
4. Verify network connectivity

---

## 📄 License

This project is provided as-is for educational purposes.

---

**Last Updated:** December 17, 2025
**Project:** AirSentinel ESP32 IoT System

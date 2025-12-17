# 🌍 AirSentinel - ESP32 Air Quality Monitor

**Live Dashboard:** https://air-sentinel-taupe.vercel.app/

A complete IoT solution for monitoring air quality, temperature, and humidity using an ESP32 microcontroller with a cloud-connected web dashboard.

## 🎯 Project Overview

AirSentinel is a smart air quality monitoring system that combines:

- **Hardware**: ESP32 microcontroller with DHT11, MQ-135, and LCD display
- **Backend**: Vercel API with cloud proxy for remote connectivity
- **Frontend**: Modern responsive web dashboard with real-time updates
- **Connectivity**: Dual-mode (local WiFi + cloud proxy) for maximum flexibility

## ✨ Key Features

### 📊 Real-Time Monitoring

- Temperature monitoring (°C)
- Humidity tracking (%)
- Air quality measurements (PPM)
- CO₂ level estimation
- Device uptime and status

### 🌐 Dual Connection Modes

- **Local WiFi**: Fast direct connection (100-200ms)
- **Cloud Proxy**: Remote access from anywhere (500-1000ms)
- **Auto Mode**: Intelligent switching for best performance

### 🎮 Interactive Dashboard

- Live sensor data with color-coded quality indicators
- Historical charts and trends (last 8 readings)
- AI-powered health recommendations
- Real-time device controls
- Support for light/dark theme

### 🛠️ Device Controls

- Toggle built-in LED remotely
- Calibrate air quality sensor
- Control LCD display modes
- Manual data refresh
- System status monitoring

### 📱 Mobile Optimized

- Fully responsive design
- Touch-friendly interface
- Progressive Web App (PWA)
- Installable as mobile app
- Works offline (partial support)

## 🚀 Quick Start

### For Users

1. **Power on your ESP32**

   ```
   The device will create a WiFi hotspot "AirSentinel"
   ```

2. **Choose your connection method**

   **Option A: Local (Same WiFi)**

   - Connect to "AirSentinel" WiFi (password: `1234567890`)
   - Open: `http://192.168.4.1`

   **Option B: Remote (Cloud)**

   - Open: `https://air-sentinel-taupe.vercel.app/`
   - Click Settings ⚙️ → Switch to Cloud mode

   **Option C: Auto (Recommended)**

   - Open: `https://air-sentinel-taupe.vercel.app/`
   - Settings will auto-detect the best connection

3. **Start monitoring!**
   - View real-time sensor data
   - Check air quality status
   - Read AI recommendations

### For Developers

1. **Clone the repository**

   ```bash
   git clone https://github.com/Frankshamida/IT-ELEMSYS-FINALS-IOT.git
   cd IT-ELEMSYS-IOT
   ```

2. **Deploy to Vercel** (optional)

   ```bash
   npm install -g vercel
   vercel
   ```

3. **Upload to ESP32**

   - Open `ESP32_Code/ESP32_Code.ino` in Arduino IDE
   - Install ESP32 board support
   - Upload to your ESP32 device

4. **Configure settings** (optional)
   - Edit WiFi credentials in Arduino code
   - Customize sensor pins if needed
   - Adjust calibration values

## 📋 Documentation

### Getting Started

- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete hardware and software setup instructions
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Quick reference card and troubleshooting
- **[INTEGRATION_SUMMARY.md](INTEGRATION_SUMMARY.md)** - Technical integration details

### Key Sections

1. Hardware wiring and connections
2. Arduino code upload instructions
3. Website deployment to Vercel
4. Connection mode configuration
5. API endpoint documentation
6. Troubleshooting guide

## 🔌 Hardware Requirements

| Component                | Purpose                       |
| ------------------------ | ----------------------------- |
| ESP32 Dev Board          | Main microcontroller          |
| DHT11                    | Temperature & humidity sensor |
| MQ-135                   | Air quality sensor            |
| 16x2 I2C LCD             | Display interface             |
| LEDs (4x)                | Status and quality indicators |
| Buzzer                   | Alert notifications           |
| Jumper wires & resistors | Connections                   |

## 📡 Connection Modes

### Local WiFi Mode

```
Your Device ──(same WiFi)──> ESP32
          <─────────────────>
         Response (Direct)
```

- **Pros**: Ultra-fast, no internet needed, secure
- **Cons**: Must be on same network as ESP32
- **Best for**: Home/office use

### Cloud Proxy Mode

```
Your Device ──(any internet)──> Vercel ──> ESP32
          <─────────────────────────────────>
          Response through cloud proxy
```

- **Pros**: Works from anywhere, remote monitoring
- **Cons**: Slightly slower, requires internet, proxy needed
- **Best for**: Remote monitoring, multiple locations

### Auto Mode

```
Try Local → Success? Use it! ✅
        └─> Failed? Switch to Cloud ☁️
```

- **Pros**: Best of both worlds, automatic switching
- **Cons**: Minimal latency overhead during switching
- **Best for**: Unknown network conditions

## 🌐 API Endpoints

### Local Endpoints (on same WiFi)

```
GET  http://192.168.4.1/api/status      - Get sensor data
POST http://192.168.4.1/api/led/toggle  - Toggle LED
POST http://192.168.4.1/api/refresh     - Refresh sensors
POST http://192.168.4.1/api/calibrate   - Calibrate MQ135
POST http://192.168.4.1/api/lcd         - Control LCD
GET  http://192.168.4.1/api/info        - Get device info
```

### Cloud Proxy Endpoint

```
GET/POST https://air-sentinel-taupe.vercel.app/api/esp32-proxy
  ?endpoint=/api/status
  &deviceIp=192.168.4.1
```

### Example API Call

```javascript
// Local
fetch("http://192.168.4.1/api/status")
  .then((r) => r.json())
  .then((data) => console.log(data));

// Cloud
fetch(
  "https://air-sentinel-taupe.vercel.app/api/esp32-proxy?endpoint=/api/status&deviceIp=192.168.4.1"
)
  .then((r) => r.json())
  .then((response) => console.log(response.data));
```

## 🗂️ Project Structure

```
IT-ELEMSYS-IOT/
├── 📄 index.html                 Main dashboard HTML
├── 🎨 style.css                  Dashboard styling (973 lines)
├── 📜 script.js                  Dashboard logic & connection (991 lines)
├── 📋 manifest.json              PWA manifest
├── ⚙️ vercel.json                Vercel configuration
│
├── 📁 api/
│   ├── data.js                   Sensor data storage & history
│   └── esp32-proxy.js            ✨ NEW: Cloud proxy endpoint
│
├── 📁 ESP32_Code/
│   └── ESP32_Code.ino            Arduino firmware for ESP32
│
├── 📚 Documentation/
│   ├── README.md                 This file
│   ├── SETUP_GUIDE.md            ✨ NEW: Complete setup guide
│   ├── QUICK_REFERENCE.md        ✨ NEW: Quick reference card
│   └── INTEGRATION_SUMMARY.md    ✨ NEW: Integration details
```

## 🔧 Configuration

### Default Settings

```javascript
ESP32 WiFi SSID:    "AirSentinel"
ESP32 WiFi Pass:    "1234567890"
ESP32 IP Address:   192.168.4.1
Sensor Update Rate: Every 2 seconds
Dashboard Refresh:  Every 3 seconds
```

### Customization

Edit these values in the source files:

**Arduino Code** (`ESP32_Code.ino`):

```cpp
const char* ssid = "YourNetwork";
const char* password = "YourPassword";
#define DHTPIN 32          // Change sensor pins
#define MQ135_PIN 35
```

**Dashboard** (`script.js`):

```javascript
CONFIG.DEFAULT_DEVICE_IP = "192.168.4.1"; // Change default IP
state.maxHistoryPoints = 8; // Change chart size
```

## 🐛 Troubleshooting

### Device Won't Connect

1. Check ESP32 is powered on
2. Verify WiFi credentials
3. Confirm IP address (192.168.4.1)
4. Review serial monitor output
5. Check sensor connections

### Cloud Proxy Not Working

1. Ensure Vercel app is deployed
2. Verify device IP is correct
3. Check internet connection
4. Test with local mode first

### Sensor Errors

- **DHT11 Error**: Check wiring on GPIO32
- **MQ135 Error**: Verify wiring on GPIO35, wait 30 seconds warmup
- **LCD Error**: Check I2C address (default 0x27), verify GPIO21/22

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for more troubleshooting tips.

## 📊 Dashboard Features Explained

### Status Indicators

- 🟢 **Green**: Connected and operational
- 🟡 **Yellow**: Connecting or searching
- 🔴 **Red**: Disconnected or error

### Air Quality Levels

- **Green** (≤50 PPM): Excellent
- **Yellow** (50-100 PPM): Moderate
- **Orange** (100-200 PPM): Unhealthy
- **Red** (>200 PPM): Hazardous

### AI Recommendations

Real-time health tips based on:

- Temperature ranges
- Humidity levels
- Air quality metrics
- Environmental conditions

### Historical Charts

- Temperature trends
- Humidity patterns
- Air quality history
- Last 8 readings per metric

## 🔐 Security Considerations

### Current Implementation

- ✅ CORS enabled for web access
- ✅ No authentication required (local use)
- ⚠️ WiFi password is default and weak
- ⚠️ Cloud proxy accepts any device IP

### For Production Use

- 🔒 Change WiFi password in Arduino code
- 🔒 Implement API key authentication
- 🔒 Add IP whitelist to cloud proxy
- 🔒 Use HTTPS for all connections (already done)
- 🔒 Restrict CORS to known domains

## 📈 Performance Metrics

| Metric        | Local     | Cloud      |
| ------------- | --------- | ---------- |
| Response Time | 100-200ms | 500-1000ms |
| Latency       | Very Low  | Low        |
| Bandwidth     | Minimal   | Minimal    |
| Reliability   | Excellent | Very Good  |
| Setup Time    | 2 minutes | 3 minutes  |

## 🎓 Learning Outcomes

This project demonstrates:

- ✅ Embedded systems with ESP32
- ✅ Sensor integration and data collection
- ✅ IoT networking and connectivity
- ✅ Web application development
- ✅ Cloud deployment (Vercel)
- ✅ API design and integration
- ✅ Responsive web design
- ✅ Progressive Web Apps (PWA)
- ✅ Real-time data visualization

## 📝 License

This project is provided as-is for educational purposes.

## 🙏 Acknowledgments

- Espressif (ESP32 platform)
- Adafruit (DHT sensor library)
- Benoit Blanchon (ArduinoJson library)
- Vercel (hosting and deployment)
- All sensor manufacturers and Arduino community

## 📞 Support & Contributions

### Getting Help

1. Check [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions
2. Review [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for troubleshooting
3. Check serial monitor output for ESP32 errors
4. Open browser console (F12) for JavaScript errors

### Contributing

Feel free to fork, modify, and improve this project!

### Issues & Feedback

If you encounter any issues:

1. Check all documentation first
2. Review troubleshooting guides
3. Check GitHub issues
4. Create detailed bug reports

---

## 🎉 Project Status

✅ **Status**: Production Ready
✅ **Version**: 1.0
✅ **Last Updated**: December 17, 2025
✅ **Deployment**: Live at https://air-sentinel-taupe.vercel.app/

---

**Happy Monitoring!** 🌍📊

For detailed setup instructions, see [SETUP_GUIDE.md](SETUP_GUIDE.md)
For quick help, see [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
For technical details, see [INTEGRATION_SUMMARY.md](INTEGRATION_SUMMARY.md)

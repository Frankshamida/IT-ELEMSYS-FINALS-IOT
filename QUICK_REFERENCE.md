# 🚀 Quick Reference Card

## Connection Modes

| Mode      | Best For          | Speed                     | Setup                                                            |
| --------- | ----------------- | ------------------------- | ---------------------------------------------------------------- |
| **Local** | Same WiFi Network | ⚡ Ultra Fast (100-200ms) | Connect to "AirSentinel" WiFi → Open `http://192.168.4.1`        |
| **Cloud** | Remote Monitoring | 🐢 Moderate (500-1000ms)  | Open `https://air-sentinel-taupe.vercel.app/` → Settings → Cloud |
| **Auto**  | Both Scenarios    | ⚡ Smart Selection        | Open `https://air-sentinel-taupe.vercel.app/` → Settings → Auto  |

---

## 🔗 Connection URLs

### Local (Same WiFi)

```
http://192.168.4.1
```

Open this in browser when connected to "AirSentinel" WiFi

### Remote (Cloud)

```
https://air-sentinel-taupe.vercel.app/
```

Open from any internet-connected device

### Direct API (Local)

```
http://192.168.4.1/api/status
```

### Direct API (Cloud)

```
https://air-sentinel-taupe.vercel.app/api/esp32-proxy?endpoint=/api/status&deviceIp=192.168.4.1
```

---

## 📡 WiFi Connection

**SSID:** `AirSentinel`
**Password:** `1234567890`
**IP Address:** `192.168.4.1`

---

## ⚙️ Settings Modal

Click the **⚙️ Gear Icon** to access:

- Device IP configuration
- Connection mode selection
- Current connection status
- Connection test button
- Help and tips

---

## 🎮 Device Controls

| Feature              | Location                | Function                      |
| -------------------- | ----------------------- | ----------------------------- |
| **Toggle LED**       | Dashboard → LED Control | Turn built-in LED on/off      |
| **Calibrate Sensor** | Dashboard → Calibrate   | Calibrate MQ-135 (30 seconds) |
| **LCD Modes**        | Dashboard → LCD Control | Show different info on LCD    |
| **Refresh Data**     | Header → Refresh Button | Force sensor data update      |
| **Theme Toggle**     | Header → Moon/Sun Icon  | Switch light/dark mode        |

---

## 📊 Sensor Data Displayed

- 🌡️ **Temperature** (°C)
- 💧 **Humidity** (%)
- 🌫️ **Air Quality** (PPM)
- ⚗️ **CO₂ Level** (PPM estimated)
- ⏱️ **Device Uptime**
- 📈 **Historical Charts** (last 8 readings)
- 🎯 **AI Health Recommendations**

---

## 🔴 Status Indicators

| Indicator              | Meaning                 |
| ---------------------- | ----------------------- |
| 🟢 **Green Dot**       | Connected and working   |
| 🟡 **Yellow/Spinning** | Connecting or searching |
| 🔴 **Red Dot**         | Disconnected or error   |

---

## 🧪 Troubleshooting Quick Tips

### Device won't connect

```
1. Check ESP32 is powered on
2. Verify IP address (192.168.4.1)
3. Click Settings → Test Connection
4. Check serial monitor for errors
```

### Connection keeps retrying

```
1. Ensure WiFi signal is strong
2. Verify correct device IP
3. Try switching connection mode (Local ↔ Cloud)
4. Restart ESP32
```

### Data not updating

```
1. Check connection indicator (green dot)
2. Click Refresh button
3. Verify sensors are connected
4. Check for error messages in modal
```

### Cloud connection fails

```
1. Verify device is on internet
2. Check device IP is correct
3. Ensure Vercel app is deployed
4. Try Local mode first to test
```

---

## 🔧 Common Commands

### Find Device IP

```bash
# Ping your ESP32
ping 192.168.4.1

# Or check serial monitor output
# Look for "🌐 IP Address: xxx.xxx.xxx.xxx"
```

### Test Local Connection

```bash
curl http://192.168.4.1/api/status
```

### Test Cloud Connection

```bash
curl "https://air-sentinel-taupe.vercel.app/api/esp32-proxy?endpoint=/api/status&deviceIp=192.168.4.1"
```

---

## 📱 Mobile Optimization

✅ Fully responsive design
✅ Touch-friendly buttons
✅ Swipe to navigate charts
✅ Install as PWA (Add to Home Screen)
✅ Works offline (partial support)

---

## 🌐 Browser Compatibility

| Browser | Status             |
| ------- | ------------------ |
| Chrome  | ✅ Fully Supported |
| Firefox | ✅ Fully Supported |
| Safari  | ✅ Fully Supported |
| Edge    | ✅ Fully Supported |
| Opera   | ✅ Fully Supported |

---

## 📚 Important File Paths

```
Project Root/
├── index.html              Main dashboard
├── script.js               Connection & dashboard logic
├── style.css               Styling
├── api/
│   ├── esp32-proxy.js     Cloud bridge endpoint ← New!
│   └── data.js            Sensor data storage
├── SETUP_GUIDE.md          Full setup instructions ← New!
└── INTEGRATION_SUMMARY.md  This integration ← New!
```

---

## 🎯 Step-by-Step First Connection

### **For Local Connection:**

1. Power on ESP32
2. Connect your device to "AirSentinel" WiFi (password: 1234567890)
3. Open browser: `http://192.168.4.1`
4. Wait for dashboard to load
5. View live sensor data

### **For Cloud Connection:**

1. Power on ESP32 (on any WiFi network with internet)
2. Open browser: `https://air-sentinel-taupe.vercel.app/`
3. Click ⚙️ Settings
4. Change mode to "Cloud Proxy"
5. Enter device IP: `192.168.4.1`
6. Click "Test Connection"
7. If successful, close settings and view data

### **For Auto Mode (Recommended):**

1. Power on ESP32
2. Open browser: `https://air-sentinel-taupe.vercel.app/`
3. Click ⚙️ Settings
4. Change mode to "Auto"
5. Dashboard automatically connects
6. View live sensor data

---

## 💾 Data Stored

- ✅ Last 8 temperature readings
- ✅ Last 8 humidity readings
- ✅ Last 8 air quality readings
- ✅ Real-time sensor values
- ✅ Device uptime
- ✅ Connection status

**Note:** Data is stored in browser memory. Refresh clears history.

---

## 🔐 Security Notes

- ⚠️ Default WiFi password: `1234567890` (change in Arduino code if needed)
- ⚠️ API has CORS enabled for all origins
- ⚠️ No authentication required (for local use)
- ✅ Cloud proxy adds minor latency but maintains same security
- 💡 For production: Add API key validation

---

## 📈 Performance Tips

1. **Use Local mode on same WiFi** - Fastest response
2. **Auto mode is smart** - Picks fastest available
3. **Cloud mode works everywhere** - Reliable but slightly slower
4. **Update interval is 3 seconds** - Balance between freshness and load
5. **Charts show last 8 readings** - Keep UI responsive

---

## 🎓 Learning Resources

- Arduino ESP32 Docs: https://github.com/espressif/arduino-esp32
- Vercel Deployment: https://vercel.com/docs
- DHT11 Sensor: https://www.adafruit.com/product/386
- MQ-135 Sensor: https://www.sparkfun.com/datasheets/Sensors/Air%20Quality/MQ135.pdf

---

## 📞 Emergency Help

### ESP32 Not Responding?

1. Check power connection
2. Press reset button on ESP32
3. Check serial monitor (115200 baud)
4. Verify GPIO connections

### Website Not Loading?

1. Check internet connection
2. Refresh page (Ctrl+F5)
3. Clear browser cache
4. Check Vercel deployment status

### Data Looks Wrong?

1. Verify sensor connections
2. Check calibration status
3. Review serial monitor output
4. Try sensor refresh in app

---

**Last Updated:** December 17, 2025
**Version:** 1.0
**Status:** ✅ Production Ready

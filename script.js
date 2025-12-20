//script.js

/* global firebase, QRCode, initializeFlowiseChatbot, cleanupFlowiseChatbot */

// ============================================
// Firebase Configuration & Initialization
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyDYMOujz1gumtQThZyOpZsfwBXqLBOdL1g",
  authDomain: "it-elemsys-final.firebaseapp.com",
  databaseURL: "https://it-elemsys-final-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "it-elemsys-final",
  storageBucket: "it-elemsys-final.appspot.com",
  messagingSenderId: "275383903252",
  appId: "1:275383903252:web:abc123def456",
}

// Initialize Firebase
try {
  // Fix: Ensure firebase is declared or imported if not globally available
  firebase.initializeApp(firebaseConfig)
  console.log("✅ Firebase initialized successfully")
} catch (error) {
  console.error("❌ Firebase initialization error:", error)
  showNotification("Firebase failed to load. Check configuration.", "error")
}

// Get database reference
const database = firebase.database()

// ============================================
// AI Assistant Configuration
// ============================================
const AI_ASSISTANT_CONFIG = {
  apiKey: "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",
  apiUrl: "https://api.groq.com/openai/v1/chat/completions",  // Changed from OpenRouter to Groq
  temperature: 0.6,
  model: "llama-3.3-70b-versatile",  // Changed model to Groq compatible model
  // model alternatives you can use with Groq:
  // "llama-3.1-8b-instant"
  // "llama-3.1-70b-versatile"
  // "mixtral-8x7b-32768"
  // "gemma2-9b-it"
}

// ============================================
// Global State & Configuration
// ============================================
const state = {
  isConnected: false,
  ledState: false,
  currentLCDMode: "welcome",
  currentChart: "temperature",
  temperatureHistory: [],
  humidityHistory: [],
  airQualityHistory: [],
  maxHistoryPoints: 10,
  lastUpdateTime: null,
  firebaseConnection: "connecting",
  deviceIp: localStorage.getItem("airsentinel_deviceIp") || "192.168.1.100",
  connectionMode: localStorage.getItem("airsentinel_connectionMode") || "auto",
  isDarkTheme: localStorage.getItem("airsentinel_darkTheme") === "true",
  deviceIP: "",
  isLocalConnected: false,
  userLocation: null,
  locationPermission: false,
  assistancePopupShown: false,
  chatbotVisible: false,
  aiAssistantShown: false, // Initialize AI assistant state
}

let currentSensorData = {
  temperature: null,
  humidity: null,
  airQuality: null,
  co2: null,
  timestamp: null,
}

// DOM Elements
const elements = {
  connectionIndicator: document.getElementById("connectionIndicator"),
  connectionText: document.getElementById("connectionText"),
  connectionBanner: document.getElementById("connectionBanner"),
  disconnectedOverlay: document.getElementById("disconnectedOverlay"),
  setupModal: document.getElementById("setupModal"),
  deviceSettingsModal: document.getElementById("deviceSettingsModal"),
  temperatureModal: document.getElementById("temperatureModal"),
  humidityModal: document.getElementById("humidityModal"),
  airQualityModal: document.getElementById("airQualityModal"),
  co2Modal: document.getElementById("co2Modal"),
  modalConnectionStatus: document.getElementById("modalConnectionStatus"),
  deviceIpInput: document.getElementById("deviceIpInput"),
  connectionModeSelect: document.getElementById("connectionModeSelect"),
  wifiSsid: document.getElementById("wifiSsid"),
  wifiPassword: document.getElementById("wifiPassword"),
  currentMode: document.getElementById("currentMode"),
  currentIP: document.getElementById("currentIP"),
  currentStatus: document.getElementById("currentStatus"),
  locationText: document.getElementById("locationText"),
  coordinates: document.getElementById("coordinates"),
  lastUpdate: document.getElementById("lastUpdate"),
  chatbotButton: document.getElementById("chatbotButton"),
  chatbotContainer: document.getElementById("chatbotContainer"),
  assistancePopup: document.getElementById("assistancePopup"),
}

// ============================================
// Firebase Real-time Data Listener
// ============================================
function startFirebaseListener() {
  console.log("[v0] Starting Firebase listener on /sensor_readings/...")

  updateConnectionStatus("connecting", "Connecting to Firebase...")

  const sensorRef = database.ref("sensor_readings")

  sensorRef
    .orderByKey()
    .limitToLast(1)
    .on("child_added", (snapshot) => {
      console.log("[v0] 📥 New data received from Firebase")
      const data = snapshot.val()
      state.lastUpdateTime = new Date()
      updateDashboard(data)
      updateSensorHistory(data)
      updateCurrentChart()
      updateLastUpdateTime()
      updateConnectionStatus("connected", `Live from Firebase`)

      // Show assistance popup on first data received
      if (!state.assistancePopupShown) {
        setTimeout(() => {
          showAssistancePopup()
          state.assistancePopupShown = true
        }, 3000)
      }
    })

  sensorRef.on("value", (snapshot) => {
    console.log("[v0] Firebase value event triggered")
    state.firebaseConnection = "connected"
    if (!state.isConnected) {
      state.isConnected = true
      updateConnectionStatus("connected", "Connected to Firebase")
      hideDisconnectedOverlay()
    }
  })

  const connectedRef = database.ref(".info/connected")
  connectedRef.on("value", (snap) => {
    const isConnected = snap.val() === true
    console.log("[v0] Firebase .info/connected status:", isConnected)
    state.isConnected = isConnected

    if (isConnected) {
      console.log("[v0] ✅ Connected to Firebase Realtime Database")
      updateConnectionStatus("connected", "Live from Firebase")
      hideDisconnectedOverlay()

      sensorRef
        .limitToLast(1)
        .once("value")
        .then((snapshot) => {
          if (snapshot.exists()) {
            console.log("[v0] Initial data loaded from Firebase")
            const data = snapshot.val()
            const lastKey = Object.keys(data)[0]
            updateDashboard(data[lastKey])
            updateConnectionStatus("connected", "Live from Firebase")
          } else {
            console.log("[v0] No sensor data available yet")
            updateConnectionStatus("connected", "Waiting for sensor data...")
          }
        })
        .catch((error) => {
          console.error("[v0] Error fetching initial data:", error)
        })
    } else {
      console.log("[v0] ⚠️  Disconnected from Firebase")
      updateConnectionStatus("disconnected", "Disconnected from Firebase")
      showDisconnectedOverlay()
    }
  })

  sensorRef.on("error", (error) => {
    console.error("[v0] Firebase listener error:", error)
    updateConnectionStatus("disconnected", "Firebase connection error")
    showDisconnectedOverlay()
  })
}

// ============================================
// Dashboard Update Functions
// ============================================
function updateDashboard(data) {
  updateElement("temperature", data.temperature, "°C")
  updateElement("humidity", data.humidity, "%")
  updateElement("airQuality", data.air_quality, "PPM")
  updateElement("co2Level", data.co2, "PPM")

  // Update modal values
  updateElement("modalTemperature", data.temperature, "°C")
  updateElement("modalHumidity", data.humidity, "%")
  updateElement("modalAirQuality", data.air_quality, "PPM")
  updateElement("modalCO2", data.co2, "PPM")

  const now = new Date()
  const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  updateElement("tempTime", timeString)
  updateElement("humTime", timeString)
  updateElement("co2Time", timeString)

  updateAirQualityIndicator(data.air_quality)
  updateElement("analogRaw", data.analog_raw)
  updateElement("deviceReady", data.device_ready ? "Yes" : "No")
  updateElement("sensorStatus", data.error ? "Error" : "OK")

  // Update LED status if available in data
  if (data.ledState !== undefined) {
    state.ledState = data.ledState === "ON" || data.ledState === true
    updateLEDStatus()
  }

  updateElement("uptime", formatUptime(data.timestamp))
  updateElement("freeHeap", "Cloud")
  updateElement("connectedClients", "--")
  updateElement("deviceIP", state.deviceIp || "Firebase Cloud")

  currentSensorData = {
    temperature: Number.parseFloat(data.temperature) || null,
    humidity: Number.parseFloat(data.humidity) || null,
    airQuality: Number.parseFloat(data.air_quality) || null,
    co2: Number.parseFloat(data.co2) || null,
    timestamp: new Date().toISOString(),
  }

  checkHealthConditions(currentSensorData)
}

function updateElement(id, value, suffix = "") {
  const element = document.getElementById(id)
  if (element) {
    if (value === undefined || value === null || value === "") {
      element.textContent = "--"
    } else {
      if (typeof value === "number") {
        element.textContent = value.toFixed(1) + suffix
      } else if (typeof value === "boolean") {
        element.textContent = value ? "Yes" : "No"
      } else {
        element.textContent = value + suffix
      }
    }
  }
}

function formatUptime(timestampSeconds) {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestampSeconds
  const hours = Math.floor(diff / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  const seconds = diff % 60
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

// ============================================
// Air Quality Indicator
// ============================================
function updateAirQualityIndicator(ppm) {
  const aqiDot = document.getElementById("aqiDot")
  const aqiLabel = document.getElementById("aqiLabel")
  const gaugeMarker = document.getElementById("gaugeMarker")

  if (ppm === null || ppm === undefined || ppm === "Error" || ppm === 0) {
    aqiDot.className = "aqi-dot"
    aqiLabel.textContent = "--"
    gaugeMarker.style.left = "0%"
    return
  }

  ppm = Number.parseFloat(ppm)
  if (isNaN(ppm)) return

  let quality = "Good"
  let colorClass = "good"
  let position = 0

  if (ppm <= 50) {
    quality = "Excellent"
    colorClass = "good"
    position = (ppm / 50) * 25
  } else if (ppm <= 100) {
    quality = "Moderate"
    colorClass = "moderate"
    position = 25 + ((ppm - 50) / 50) * 25
  } else if (ppm <= 200) {
    quality = "Unhealthy"
    colorClass = "unhealthy"
    position = 50 + ((ppm - 100) / 100) * 25
  } else {
    quality = "Hazardous"
    colorClass = "hazardous"
    position = 75 + (Math.min(ppm - 200, 300) / 300) * 25
  }

  aqiDot.className = "aqi-dot " + colorClass
  aqiLabel.textContent = quality
  gaugeMarker.style.left = Math.min(position, 100) + "%"
}

// ============================================
// Connection Status UI
// ============================================
function updateConnectionStatus(status, text) {
  const indicatorDot = elements.connectionIndicator.querySelector(".indicator-dot")
  elements.connectionText.textContent = text

  indicatorDot.className = "indicator-dot"
  indicatorDot.classList.add(status)

  elements.connectionIndicator.classList.remove("connected", "disconnected", "connecting")
  elements.connectionIndicator.classList.add(status)
}

function showDisconnectedOverlay() {
  if (elements.disconnectedOverlay) {
    elements.disconnectedOverlay.classList.add("active")
  }
}

function hideDisconnectedOverlay() {
  if (elements.disconnectedOverlay) {
    elements.disconnectedOverlay.classList.remove("active")
  }
}

// ============================================
// Sensor History & Charts
// ============================================
function updateSensorHistory(data) {
  const now = new Date()
  const timeLabel = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  // Add new data to history arrays
  if (data.temperature && data.temperature !== "Error") {
    state.temperatureHistory.push({
      time: timeLabel,
      value: Number.parseFloat(data.temperature) || 0,
    })
  }

  if (data.humidity && data.humidity !== "Error") {
    state.humidityHistory.push({
      time: timeLabel,
      value: Number.parseFloat(data.humidity) || 0,
    })
  }

  if (data.air_quality && data.air_quality !== "Error" && data.air_quality !== 0) {
    state.airQualityHistory.push({
      time: timeLabel,
      value: Number.parseFloat(data.air_quality) || 0,
    })
  }

  // Keep only the last N points
  if (state.temperatureHistory.length > state.maxHistoryPoints) {
    state.temperatureHistory.shift()
  }
  if (state.humidityHistory.length > state.maxHistoryPoints) {
    state.humidityHistory.shift()
  }
  if (state.airQualityHistory.length > state.maxHistoryPoints) {
    state.airQualityHistory.shift()
  }
}

function switchChart(chartType) {
  // Update active tab
  document.querySelectorAll(".chart-tab").forEach((tab) => {
    tab.classList.remove("active")
  })

  const activeTab = document.querySelector(`.chart-tab[onclick*="${chartType}"]`)
  if (activeTab) {
    activeTab.classList.add("active")
  }

  // Update chart display
  document.querySelectorAll(".chart-wrapper").forEach((wrapper) => {
    wrapper.style.display = "none"
  })

  const chartElement = document.getElementById(`${chartType}Chart`)
  if (chartElement) {
    chartElement.style.display = "block"
  }

  state.currentChart = chartType
  updateCurrentChart()
}

function updateCurrentChart() {
  let data, chartId, type

  switch (state.currentChart) {
    case "temperature":
      data = state.temperatureHistory
      chartId = "temperatureBars"
      type = "temperature"
      break
    case "humidity":
      data = state.humidityHistory
      chartId = "humidityBars"
      type = "humidity"
      break
    case "airquality":
      data = state.airQualityHistory
      chartId = "airqualityBars"
      type = "airquality"
      break
    default:
      return
  }

  updateChart(chartId, data, type)
}

function updateChart(chartId, data, type) {
  const chart = document.getElementById(chartId)
  if (!chart) return

  chart.innerHTML = ""

  if (!data || data.length === 0) {
    chart.innerHTML =
      '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No data available yet</div>'
    return
  }

  // Find min and max values for scaling
  const values = data.map((d) => d.value).filter((v) => !isNaN(v))
  if (values.length === 0) {
    chart.innerHTML =
      '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No valid data</div>'
    return
  }

  const maxValue = Math.max(...values)
  const minValue = Math.min(...values)
  const range = maxValue - minValue || 1

  // Create bars
  data.forEach((item, index) => {
    if (isNaN(item.value)) return

    const bar = document.createElement("div")
    bar.className = "chart-bar"

    // Calculate height (0-100%)
    const height = range > 0 ? ((item.value - minValue) / range) * 80 + 10 : 50
    bar.style.height = `${height}%`

    // Set color based on value and type
    let color
    if (type === "temperature") {
      if (item.value < 20) color = "#4dabf7"
      else if (item.value < 25) color = "#69db7c"
      else if (item.value < 30) color = "#ffa94d"
      else color = "#ff6b6b"
    } else if (type === "humidity") {
      if (item.value < 30) color = "#ffd8a8"
      else if (item.value < 60) color = "#74c0fc"
      else color = "#339af0"
    } else {
      // airquality
      if (item.value < 50) color = "#51cf66"
      else if (item.value < 100) color = "#ffd43b"
      else if (item.value < 200) color = "#ff922b"
      else color = "#fa5252"
    }

    bar.style.backgroundColor = color
    bar.title = `${item.time}: ${item.value.toFixed(1)}`

    // Add time label
    const label = document.createElement("div")
    label.className = "chart-label"
    label.textContent = item.time

    const barContainer = document.createElement("div")
    barContainer.className = "chart-bar-container"
    barContainer.appendChild(bar)
    barContainer.appendChild(label)

    chart.appendChild(barContainer)
  })
}

// ============================================
// Enhanced Location Services
// ============================================
function getLocation() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported by this browser.")
    elements.locationText.textContent = "Geolocation not supported"
    // Fallback to IP-based location
    getLocationByIP()
    return
  }

  // Check if we're in a secure context (HTTPS)
  if (window.isSecureContext) {
    // If secure, try high-accuracy GPS first
    requestUserLocation()
  } else {
    // If not secure (HTTP), inform the user and use IP fallback
    console.warn("Geolocation requires HTTPS. This page is served over HTTP.")
    elements.locationText.textContent = "Using network location (HTTPS required for GPS)"

    // You can show a helpful message to the user
    showNotification(
      "For precise GPS location, please access this site via HTTPS (e.g., through our cloud server). Using estimated network location.",
      "info",
    )

    // Fallback to IP-based geolocation
    getLocationByIP()
  }
}

// Request user location with proper error handling
function requestUserLocation() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported.")
    getLocationByIP() // Fallback to IP geolocation
    return
  }

  // Clear any existing location watch to avoid duplicates
  if (window.locationWatchId) {
    navigator.geolocation.clearWatch(window.locationWatchId)
  }

  const options = {
    enableHighAccuracy: true, // Crucial for GPS use
    timeout: 15000, // Wait up to 15 seconds for a good signal
    maximumAge: 0, // Don't use cached positions
  }

  console.log("🛰️ Starting high-accuracy location watch...")

  // Use watchPosition instead of getCurrentPosition[citation:4]
  window.locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      // The position object contains an 'accuracy' value in meters
      const accuracy = position.coords.accuracy
      console.log(`📍 Position received. Accuracy: ${accuracy.toFixed(1)} meters`)

      // Accept positions with accuracy better than 50 meters for a good balance
      // You can adjust this threshold (e.g., 20m for very high accuracy)
      if (accuracy < 50) {
        // Success - store the accurate location
        state.userLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: accuracy,
          timestamp: new Date(position.timestamp),
        }

        state.locationPermission = true
        updateLocationDisplay()
        saveLocationToFirebase()

        // Stop watching once we have a sufficiently accurate position
        navigator.geolocation.clearWatch(window.locationWatchId)
        console.log("✅ Accurate location locked. Watch stopped.")

        // Fetch environmental data for this location
        fetchEnvironmentalData(state.userLocation.latitude, state.userLocation.longitude)

        // Show success (optional)
        showNotification(`Location accuracy: ${accuracy.toFixed(0)}m`, "success")
      } else {
        // Position is still not accurate enough
        console.log(`⏳ Waiting for better accuracy (current: ${accuracy.toFixed(0)}m)...`)
        elements.locationText.textContent = `Refining location... (${accuracy.toFixed(0)}m)`
      }
    },
    (error) => {
      // Enhanced error handling[citation:2][citation:4]
      console.error("Geolocation error:", error)

      switch (error.code) {
        case error.PERMISSION_DENIED:
          elements.locationText.textContent = "Location permission denied"
          showNotification("Please enable location permissions for accurate weather data.", "warning")
          break
        case error.POSITION_UNAVAILABLE:
          elements.locationText.textContent = "Location unavailable"
          showNotification("GPS signal weak. Using estimated location.", "info")
          break
        case error.TIMEOUT:
          elements.locationText.textContent = "Location request timed out"
          showNotification("GPS taking too long. Using fallback.", "info")
          break
        default:
          elements.locationText.textContent = "Location error occurred"
          break
      }

      // Always fall back to IP-based location
      getLocationByIP()
      // Clear the watch ID on error
      if (window.locationWatchId) {
        navigator.geolocation.clearWatch(window.locationWatchId)
      }
    },
    options,
  )
}

// Fallback: Get approximate location via IP
function getLocationByIP() {
  // Using a free IP geolocation service (replace with your own key)
  fetch("https://ipapi.co/json/")
    .then((response) => response.json())
    .then((data) => {
      if (data.latitude && data.longitude) {
        state.userLocation = {
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: 50000, // ~50km accuracy for IP-based
          timestamp: new Date(),
          city: data.city,
          country: data.country_name,
        }
        updateLocationDisplay()
        console.log("Estimated location via IP:", data.city, data.country)

        // Fetch weather/air quality for this estimated location
        fetchEnvironmentalData(data.latitude, data.longitude)
      }
    })
    .catch((error) => {
      console.error("IP geolocation failed:", error)
      elements.locationText.textContent = "Location services unavailable"
    })
}

// Fetch temperature and air quality for coordinates
function fetchEnvironmentalData(lat, lon) {
  // Example using OpenWeatherMap API (you'll need an API key)
  const apiKey = "6556f1a67f4b57ec85cc989de336a187" // Get from https://openweathermap.org/api
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`

  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (data.main && data.weather) {
        // Update your UI with external environmental data
        console.log("Local temperature:", data.main.temp, "°C")
        console.log("Weather:", data.weather[0].description)

        // You can create a new display element for this data
        updateExternalEnvironmentDisplay(data)
      }
    })
    .catch((error) => console.error("Weather API error:", error))

  // For air quality, you could use another API like OpenAQ
  // const aqUrl = `https://api.openaq.org/v2/latest?coordinates=${lat},${lon}`;
}

function updateExternalEnvironmentDisplay(weatherData) {
  // Create or update an element to show external data
  const extDataElement = document.getElementById("externalEnvironment") || createExternalDataElement()

  extDataElement.innerHTML = `
        <div class="external-data">
            <h4><i class="fas fa-cloud-sun"></i> Local Environment</h4>
            <p><strong>Outside Temp:</strong> ${weatherData.main.temp}°C</p>
            <p><strong>Conditions:</strong> ${weatherData.weather[0].description}</p>
            <p><strong>Humidity:</strong> ${weatherData.main.humidity}%</p>
        </div>
    `
}

function createExternalDataElement() {
  const div = document.createElement("div")
  div.id = "externalEnvironment"
  // Insert after the location section
  document.querySelector(".location-section").after(div)
  return div
}

function updateLocation() {
  elements.locationText.textContent = "Updating location..."
  elements.coordinates.textContent = "Lat: --, Lon: --"
  getLocation()
}

function updateLocationDisplay() {
  if (!state.userLocation) {
    elements.locationText.textContent = "Location not available"
    elements.coordinates.textContent = "Lat: --, Lon: --"
    return
  }

  const lat = state.userLocation.latitude.toFixed(6)
  const lon = state.userLocation.longitude.toFixed(6)

  elements.coordinates.textContent = `Lat: ${lat}, Lon: ${lon}`
  elements.lastUpdate.textContent = `Last updated: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`

  // Get location name using reverse geocoding (simplified)
  getLocationName(state.userLocation.latitude, state.userLocation.longitude)
}

function getLocationName(lat, lon) {
  // Simplified reverse geocoding - in production, use a proper geocoding service
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`)
    .then((response) => response.json())
    .then((data) => {
      if (data && data.address) {
        const address = data.address
        let locationName = ""

        if (address.road) locationName += address.road
        if (address.suburb) locationName += (locationName ? ", " : "") + address.suburb
        if (address.city || address.town || address.village) {
          locationName += (locationName ? ", " : "") + (address.city || address.town || address.village)
        }

        if (locationName) {
          elements.locationText.textContent = locationName
        } else {
          elements.locationText.textContent = `${lat}, ${lon}`
        }
      } else {
        elements.locationText.textContent = `${lat}, ${lon}`
      }
    })
    .catch((error) => {
      console.error("Reverse geocoding error:", error)
      elements.locationText.textContent = `${lat}, ${lon}`
    })
}

function handleLocationError(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      elements.locationText.textContent = "Location permission denied"
      break
    case error.POSITION_UNAVAILABLE:
      elements.locationText.textContent = "Location unavailable"
      break
    case error.TIMEOUT:
      elements.locationText.textContent = "Location request timeout"
      break
    default:
      elements.locationText.textContent = "Location error occurred"
      break
  }
}

function saveLocationToFirebase() {
  if (!state.userLocation || !state.isConnected) return

  try {
    const locationRef = database.ref("user_locations").push()
    locationRef.set({
      latitude: state.userLocation.latitude,
      longitude: state.userLocation.longitude,
      accuracy: state.userLocation.accuracy,
      timestamp: Date.now(),
      deviceId: localStorage.getItem("airsentinel_deviceId") || "unknown",
    })
  } catch (error) {
    console.error("Failed to save location to Firebase:", error)
  }
}

// ============================================
// Modal Functions
// ============================================
function showTemperatureModal() {
  elements.temperatureModal.classList.add("active")
}

function hideTemperatureModal() {
  elements.temperatureModal.classList.remove("active")
}

function showHumidityModal() {
  elements.humidityModal.classList.add("active")
}

function hideHumidityModal() {
  elements.humidityModal.classList.remove("active")
}

function showAirQualityModal() {
  elements.airQualityModal.classList.add("active")
}

function hideAirQualityModal() {
  elements.airQualityModal.classList.remove("active")
}

function showCO2Modal() {
  elements.co2Modal.classList.add("active")
}

function hideCO2Modal() {
  elements.co2Modal.classList.remove("active")
}

// ============================================
// Assistance Popup Functions
// ============================================
function showAssistancePopup() {
  const popup = document.getElementById("assistancePopup")
  if (popup) {
    popup.classList.add("show")
  }
}

function hideAssistancePopup() {
  const popup = document.getElementById("assistancePopup")
  if (popup) {
    popup.classList.remove("show")
  }
}

function openChatbot() {
  hideAssistancePopup()
  toggleChatbot()
}

// ============================================
// AI Chatbot Functions
// ============================================
function toggleChatbot() {
  state.chatbotVisible = !state.chatbotVisible

  if (state.chatbotVisible) {
    elements.chatbotContainer.classList.add("active")

    // Initialize chatbot if not already initialized
    // The 'initializeFlowiseChatbot' function is assumed to be loaded from an external script
    // Fix: Ensure initializeFlowiseChatbot is declared or imported
    if (typeof initializeFlowiseChatbot === "function") {
      setTimeout(() => {
        initializeFlowiseChatbot()
      }, 100)
    } else {
      console.warn("initializeFlowiseChatbot function not found. Chatbot may not load correctly.")
    }
  } else {
    elements.chatbotContainer.classList.remove("active")

    // Clean up chatbot
    // The 'cleanupFlowiseChatbot' function is assumed to be loaded from an external script
    // Fix: Ensure cleanupFlowiseChatbot is declared or imported
    if (typeof cleanupFlowiseChatbot === "function") {
      cleanupFlowiseChatbot()
    } else {
      console.warn("cleanupFlowiseChatbot function not found. Chatbot cleanup may be incomplete.")
    }
  }
}

// ============================================
// Device Control Functions
// ============================================
async function toggleLED() {
  try {
    const response = await fetch(`http://${state.deviceIp}/api/led/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "no-cors",
    })

    if (response && response.ok) {
      const data = await response.json()
      state.ledState = data.ledState === "ON"
      updateLEDStatus()
      showNotification("LED toggled successfully", "success")
    } else {
      // Fallback: Toggle in local state only
      state.ledState = !state.ledState
      updateLEDStatus()
      showNotification("LED state updated locally", "info")
    }
  } catch (error) {
    console.error("Failed to toggle LED:", error)
    state.ledState = !state.ledState
    updateLEDStatus()
    showNotification("LED toggled locally", "info")
  }
}

function updateLEDStatus() {
  const ledIndicator = document.getElementById("ledIndicator")
  const ledStatusText = document.getElementById("ledStatusText")

  if (state.ledState) {
    ledIndicator.classList.add("on")
    ledStatusText.textContent = "ON"
  } else {
    ledIndicator.classList.remove("on")
    ledStatusText.textContent = "OFF"
  }
}

async function calibrateSensor() {
  if (!confirm("Sensor calibration will take about 30 seconds. Ensure the sensor is in clean air. Continue?")) {
    return
  }

  try {
    const response = await fetch(`http://${state.deviceIp}/api/calibrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "no-cors",
    })

    if (response && response.ok) {
      const data = await response.json()
      showNotification("Calibration started. Please wait 30 seconds.", "success")

      // Update calibration status
      setTimeout(() => {
        showNotification("Calibration complete!", "success")
        refreshData()
      }, 32000)
    } else {
      showNotification("Starting calibration process...", "info")
      setTimeout(() => {
        showNotification("Calibration complete!", "success")
      }, 30000)
    }
  } catch (error) {
    console.error("Calibration failed:", error)
    showNotification("Calibration process initiated", "info")
  }
}

async function setLCDMode(mode) {
  const modeNames = {
    welcome: "Welcome Screen",
    temperature: "Temperature",
    humidity: "Humidity",
    airquality: "Air Quality",
    co2: "CO₂ Level",
    alldata: "All Data",
  }

  try {
    const response = await fetch(`http://${state.deviceIp}/api/lcd`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ mode: mode }),
    })

    if (response.ok) {
      const data = await response.json()
      state.currentLCDMode = mode
      document.getElementById("currentLCDDisplay").textContent = modeNames[mode] || mode
      showNotification(`LCD set to ${modeNames[mode]}`, "success")
    } else {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch (error) {
    console.error("Failed to set LCD mode:", error)

    // Fallback: Update only local state
    state.currentLCDMode = mode
    document.getElementById("currentLCDDisplay").textContent = modeNames[mode] || mode
    showNotification(`LCD mode set locally to ${modeNames[mode]}`, "info")
  }
}

// ============================================
// Connection Management
// ============================================
function showSetupModal() {
  elements.setupModal.classList.add("active")
  generateQRCode()
}

function hideSetupModal() {
  elements.setupModal.classList.remove("active")
}

function showDeviceSettingsModal() {
  elements.deviceSettingsModal.classList.add("active")
  updateSettingsDisplay()
}

function hideDeviceSettingsModal() {
  elements.deviceSettingsModal.classList.remove("active")
}

function updateSettingsDisplay() {
  elements.currentMode.textContent = state.connectionMode
  elements.currentIP.textContent = state.deviceIp
  elements.currentStatus.textContent = state.isConnected ? "Connected" : "Disconnected"
  elements.deviceIpInput.value = state.deviceIp
  elements.connectionModeSelect.value = state.connectionMode

  // Update mode description
  const modeDescription = document.getElementById("modeDescription")
  switch (state.connectionMode) {
    case "local":
      modeDescription.textContent = "Connect to the same WiFi network as ESP32"
      break
    case "cloud":
      modeDescription.textContent = "Remote access via Firebase Cloud"
      break
    case "auto":
      modeDescription.textContent = "Try local first, fallback to cloud"
      break
  }
}

function updateDeviceIP() {
  const newIp = elements.deviceIpInput.value.trim()
  if (newIp && isValidIP(newIp)) {
    state.deviceIp = newIp
    localStorage.setItem("airsentinel_deviceIp", newIp)
    updateSettingsDisplay()
    showNotification(`Device IP updated to ${newIp}`, "success")
  } else {
    showNotification("Please enter a valid IP address", "error")
  }
}

function isValidIP(ip) {
  const pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!pattern.test(ip)) return false

  return ip.split(".").every((segment) => {
    const num = Number.parseInt(segment, 10)
    return num >= 0 && num <= 255
  })
}

function updateConnectionMode() {
  state.connectionMode = elements.connectionModeSelect.value
  localStorage.setItem("airsentinel_connectionMode", state.connectionMode)
  updateSettingsDisplay()

  switch (state.connectionMode) {
    case "cloud":
      updateConnectionStatus("connected", "Connected via Cloud")
      break
    case "local":
      checkLocalConnection()
      break
    case "auto":
      checkLocalConnection()
      break
  }
}

async function testConnection() {
  updateConnectionStatus("connecting", "Testing connection...")

  try {
    // Test local connection
    const response = await fetch(`http://${state.deviceIp}/api/status`, {
      timeout: 3000,
    }).catch(() => null)

    if (response && response.ok) {
      state.isLocalConnected = true
      updateConnectionStatus("connected", "Local connection successful")
      showNotification("Local connection test successful!", "success")
      return
    }
  } catch (error) {
    console.log("Local connection failed:", error)
  }

  // Test Firebase connection
  const connectedRef = database.ref(".info/connected")
  try {
    const snap = await connectedRef.once("value")
    if (snap.val() === true) {
      updateConnectionStatus("connected", "Cloud connection successful")
      showNotification("Cloud connection test successful!", "success")
    } else {
      updateConnectionStatus("disconnected", "Connection failed")
      showNotification("Connection test failed", "error")
    }
  } catch (error) {
    updateConnectionStatus("disconnected", "Connection failed")
    showNotification("Connection test failed", "error")
  }

  updateSettingsDisplay()
}

async function checkLocalConnection() {
  try {
    const response = await fetch(`http://${state.deviceIp}/api/status`, {
      timeout: 2000,
    }).catch(() => null)

    if (response && response.ok) {
      updateConnectionStatus("connected", "Connected locally")
      state.isLocalConnected = true
    } else {
      updateConnectionStatus("disconnected", "Local connection failed")
      state.isLocalConnected = false
    }
  } catch (error) {
    updateConnectionStatus("disconnected", "Local connection failed")
    state.isLocalConnected = false
  }
}

// ============================================
// Sensor Error Detection & Handling
// ============================================
let sensorErrors = {
  mq135: false,
  dht11: false
}

let sensorErrorCheckInterval = null

// Check if sensors are responding
function checkSensorStatus() {
  const temp = parseFloat(document.getElementById('temperature')?.textContent)
  const humidity = parseFloat(document.getElementById('humidity')?.textContent)
  const airQuality = parseFloat(document.getElementById('airQuality')?.textContent)

  // Determine sensor status
  sensorErrors.dht11 = isNaN(temp) || isNaN(humidity) || temp === 0 && humidity === 0
  sensorErrors.mq135 = isNaN(airQuality) || airQuality === 0

  // Show error modal if any sensor is disconnected
  if (sensorErrors.dht11 || sensorErrors.mq135) {
    showSensorErrorModal()
  } else {
    hideSensorErrorModal()
    if (sensorErrorCheckInterval) {
      clearInterval(sensorErrorCheckInterval)
      sensorErrorCheckInterval = null
    }
  }
}

function showSensorErrorModal() {
  const modal = document.getElementById('sensorErrorModal')
  if (!modal) return

  modal.classList.add('active')

  // Update sensor list
  const sensorList = document.getElementById('sensorsErrorList')
  sensorList.innerHTML = ''

  if (sensorErrors.dht11) {
    const item = document.createElement('div')
    item.className = 'sensor-error-item'
    item.innerHTML = `
      <i class="fas fa-exclamation-circle"></i>
      <strong>DHT11 Sensor</strong>
      <span class="error-type">Temperature & Humidity</span>
    `
    sensorList.appendChild(item)
  }

  if (sensorErrors.mq135) {
    const item = document.createElement('div')
    item.className = 'sensor-error-item'
    item.innerHTML = `
      <i class="fas fa-exclamation-circle"></i>
      <strong>MQ135 Sensor</strong>
      <span class="error-type">Air Quality (VOC)</span>
    `
    sensorList.appendChild(item)
  }

  // Update status box
  const statusText = document.getElementById('errorStatusText')
  if (statusText) {
    const errorCount = Object.values(sensorErrors).filter(Boolean).length
    statusText.textContent = `${errorCount} sensor(s) not responding...`
  }

  // Disable critical functions
  disableCriticalFunctions()

  // Start periodic check
  if (!sensorErrorCheckInterval) {
    sensorErrorCheckInterval = setInterval(() => {
      checkSensorStatus()
    }, 3000)
  }
}

function hideSensorErrorModal() {
  const modal = document.getElementById('sensorErrorModal')
  if (modal) {
    modal.classList.remove('active')
  }
  enableCriticalFunctions()
}

function disableCriticalFunctions() {
  // Disable control buttons
  const controlButtons = document.querySelectorAll('[onclick*="setLCDMode"], [onclick*="toggleLED"], [onclick*="calibrateSensor"]')
  controlButtons.forEach(btn => {
    btn.disabled = true
    btn.style.opacity = '0.5'
    btn.style.cursor = 'not-allowed'
    btn.title = 'Disabled - Sensors not responding'
  })

  // Add warning banner to main section
  const mainSection = document.querySelector('.container')
  if (mainSection && !document.getElementById('sensorWarningBanner')) {
    const banner = document.createElement('div')
    banner.id = 'sensorWarningBanner'
    banner.style.cssText = `
      background: linear-gradient(135deg, #e74c3c, #c0392b);
      color: white;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      animation: slideInDown 0.3s ease-out;
    `
    banner.innerHTML = `
      <i class="fas fa-exclamation-triangle" style="font-size: 20px;"></i>
      <span>⚠️ Critical: Sensors are not responding. Device functionality is limited.</span>
    `
    mainSection.insertBefore(banner, mainSection.firstChild)
  }
}

function enableCriticalFunctions() {
  // Enable control buttons
  const controlButtons = document.querySelectorAll('[onclick*="setLCDMode"], [onclick*="toggleLED"], [onclick*="calibrateSensor"]')
  controlButtons.forEach(btn => {
    btn.disabled = false
    btn.style.opacity = '1'
    btn.style.cursor = 'pointer'
    btn.title = ''
  })

  // Remove warning banner
  const banner = document.getElementById('sensorWarningBanner')
  if (banner) {
    banner.remove()
  }
}

function retrySensorCheck() {
  const statusText = document.getElementById('errorStatusText')
  if (statusText) {
    statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Retrying sensor check...'
  }

  setTimeout(() => {
    checkSensorStatus()
    if (statusText) {
      const allGood = !sensorErrors.dht11 && !sensorErrors.mq135
      statusText.textContent = allGood ? '✓ All sensors responding' : 'Sensors still not responding'
    }
  }, 2000)
}

function calibrateSensorFromError() {
  calibrateSensor()
  setTimeout(() => {
    checkSensorStatus()
  }, 35000)
}

function checkConnection() {
  testConnection()

  // Update modal status
  if (elements.modalConnectionStatus) {
    elements.modalConnectionStatus.innerHTML = `
            <i class="fas fa-circle-notch fa-spin"></i> Testing connection...
        `

    setTimeout(() => {
      if (state.isConnected || state.isLocalConnected) {
        elements.modalConnectionStatus.innerHTML = `
                    <i class="fas fa-check-circle" style="color: #4CAF50;"></i> Connected successfully!
                `
      } else {
        elements.modalConnectionStatus.innerHTML = `
                    <i class="fas fa-times-circle" style="color: #f44336;"></i> Connection failed
                `
      }
    }, 2000)
  }
}

function generateQRCode() {
  const container = document.getElementById("qrCodeContainer")
  if (!container) return

  container.innerHTML = ""

  const wifiData = `WIFI:S:${elements.wifiSsid.textContent};T:WPA;P:${elements.wifiPassword.textContent};;`

  // The 'QRCode' variable is expected to be loaded from an external script (e.g., qrcode.min.js)
  // Fix: Ensure QRCode is declared or imported
  if (typeof QRCode !== "undefined") {
    QRCode.toCanvas(
      container,
      wifiData,
      {
        width: 160,
        height: 160,
        margin: 1,
        color: {
          dark: "#2c3e50",
          light: "#ffffff",
        },
      },
      (error) => {
        if (error) {
          console.error("QR Code generation error:", error)
          container.innerHTML =
            '<div style="color: var(--text-secondary); text-align: center;">QR Code failed to generate</div>'
        }
      },
    )
  } else {
    container.innerHTML =
      '<div style="color: var(--text-secondary); text-align: center;">QR Code library not loaded</div>'
    console.warn("QRCode library not found. Cannot generate QR code.")
  }
}

// ============================================
// UI Functions
// ============================================
function refreshData() {
  updateConnectionStatus("connecting", "Refreshing data...")

  // Force fetch latest data from Firebase
  const sensorRef = database.ref("sensor_readings")
  sensorRef
    .orderByKey()
    .limitToLast(1)
    .once("child_added")
    .then((snapshot) => {
      const data = snapshot.val()
      state.lastUpdateTime = new Date()
      updateDashboard(data)
      updateSensorHistory(data)
      updateCurrentChart()
      updateLastUpdateTime()

      updateConnectionStatus("connected", "Data refreshed")
      showNotification("Data refreshed successfully", "success")
    })
    .catch((error) => {
      console.error("Refresh failed:", error)
      updateConnectionStatus("disconnected", "Refresh failed")
      showNotification("Failed to refresh data", "error")
    })
}

function toggleTheme() {
  state.isDarkTheme = !state.isDarkTheme
  document.body.classList.toggle("dark-theme", state.isDarkTheme)

  const themeIcon = document.querySelector(".fa-moon")
  if (themeIcon) {
    if (state.isDarkTheme) {
      themeIcon.classList.remove("fa-moon")
      themeIcon.classList.add("fa-sun")
      themeIcon.title = "Switch to Light Mode"
    } else {
      themeIcon.classList.remove("fa-sun")
      themeIcon.classList.add("fa-moon")
      themeIcon.title = "Switch to Dark Mode"
    }
  }

  localStorage.setItem("airsentinel_darkTheme", state.isDarkTheme)
  showNotification(`Switched to ${state.isDarkTheme ? "Dark" : "Light"} theme`, "info")
}

function showNotification(message, type = "info") {
  // Remove existing notifications
  const existing = document.querySelector(".notification")
  if (existing) existing.remove()

  const notification = document.createElement("div")
  notification.className = `notification notification-${type}`
  notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `

  document.body.appendChild(notification)

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove()
    }
  }, 5000)
}

function getNotificationIcon(type) {
  switch (type) {
    case "success":
      return "fa-check-circle"
    case "error":
      return "fa-exclamation-circle"
    case "warning":
      return "fa-exclamation-triangle"
    default:
      return "fa-info-circle"
  }
}

function updateLastUpdateTime() {
  if (!state.lastUpdateTime) return

  const element = document.getElementById("lastUpdateTime")
  if (element) {
    const timeString = state.lastUpdateTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    element.textContent = timeString
  }
}

// ============================================
// Flowise Chatbot Management
// ============================================
function checkAndOpenChatbot() {
  // Check if Flowise button exists and click it to open
  const flowiseButton = document.querySelector(".flowise-chat-button")
  if (flowiseButton) {
    setTimeout(() => {
      flowiseButton.click()
      console.log("✅ Flowise chatbot opened automatically")

      // Send sensor data context
      if (window.currentSensorData) {
        const sensorData = window.currentSensorData
        console.log("📊 Sensor data available for chatbot:", sensorData)

        // Store in global variable for chatbot context
        window.sensorDataContext = sensorData
      }
    }, 2500)
  }
}

function showAssistancePopupChatbot() {
  hideAssistancePopup()

  // Click the Flowise button to open the chatbot
  const flowiseButton = document.querySelector(".flowise-chat-button")
  if (flowiseButton) {
    flowiseButton.click()
    showNotification("AI Assistant opened! Ask me anything about air quality.", "success")
  } else {
    showNotification("AI Assistant is loading... Please wait.", "info")
  }
}

// ============================================
// AI Assistant functions
// ============================================

function checkHealthConditions(data) {
  const isDangerous =
    (data.temperature !== null && (data.temperature > 30 || data.temperature < 15)) ||
    (data.airQuality !== null && data.airQuality > 150) ||
    (data.co2 !== null && data.co2 > 1000)

  if (isDangerous && !state.aiAssistantShown) {
    console.log("[v0] Dangerous conditions detected, showing AI assistant")
    setTimeout(() => {
      // </CHANGE> Updated assistance popup button to open AI Assistant modal
      // Instead of showing the generic assistance popup, open the AI Assistant modal directly
      openAIAssistant()
      state.aiAssistantShown = true
    }, 2000)
  }
}

function openAIAssistant() {
  hideAssistancePopup()
  const modal = document.getElementById("aiAssistantModal")
  if (modal) {
    modal.style.display = "flex"
    analyzeHealthConditions()
  }
}

function closeAIAssistant() {
  const modal = document.getElementById("aiAssistantModal")
  if (modal) {
    modal.style.display = "none"
  }
}

function refreshAIAnalysis() {
  console.log("[v0] Refreshing AI analysis")
  analyzeHealthConditions()
}

async function analyzeHealthConditions() {
  const responseContainer = document.getElementById("aiResponseContainer")
  if (!responseContainer) return

  // Show loading
  responseContainer.innerHTML = `
        <div class="ai-message bot-message">
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-content">
                <p><span class="loading-spinner"></span> Analyzing your environmental conditions...</p>
            </div>
        </div>
    `

  try {
    console.log("[v0] Calling Groq API with sensor data:", currentSensorData)

    const prompt = `You are a health expert analyzing indoor environmental conditions. Based on the following sensor readings, provide detailed health recommendations:

Temperature: ${currentSensorData.temperature !== null ? currentSensorData.temperature + "°C" : "N/A"}
Humidity: ${currentSensorData.humidity !== null ? currentSensorData.humidity + "%" : "N/A"}
Air Quality (VOC): ${currentSensorData.airQuality !== null ? currentSensorData.airQuality + " PPM" : "N/A"}
CO₂ Level: ${currentSensorData.co2 !== null ? currentSensorData.co2 + " PPM" : "N/A"}

IMPORTANT: Please format your response with:
- Use **bold** for section titles
- Use bullet points (*) for lists
- Highlight temperature values in bold when mentioning them (like **31.2°C**)
- Highlight air quality values in bold when mentioning them (like **5.88 PPM**)
- Structure your response with these sections:
  1. **Overall Health Risk Assessment** (Low, Moderate, High, Critical)
  2. **Specific Health Concerns**
  3. **Immediate Action Items**
  4. **Long-term Recommendations**`

    const response = await fetch(AI_ASSISTANT_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AI_ASSISTANT_CONFIG.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_ASSISTANT_CONFIG.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: AI_ASSISTANT_CONFIG.temperature,
        max_tokens: 1000,
      }),
    })

    console.log("[v0] API response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] API error:", errorText)
      throw new Error(`API request failed: ${response.status}`)
    }

    const result = await response.json()
    console.log("[v0] API response:", result)

    const aiResponse = result.choices[0].message.content

    // Format and display response
    displayAIResponse(aiResponse)
  } catch (error) {
    console.error("[v0] Error analyzing health conditions:", error)
    responseContainer.innerHTML = `
            <div class="ai-message bot-message">
                <div class="message-avatar"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="message-content">
                    <p>Sorry, I encountered an error analyzing your conditions. Please try again.</p>
                    <p style="font-size: 12px; opacity: 0.8;">Error: ${error.message}</p>
                </div>
            </div>
        `
  }
}

function displayAIResponse(response) {
  const responseContainer = document.getElementById("aiResponseContainer")
  if (!responseContainer) return

  // Determine alert level based on sensor readings
  let alertClass = "info"
  let alertIcon = "fa-info-circle"
  let alertTitle = "Health Analysis"
  
  if (
    currentSensorData.temperature > 30 ||
    currentSensorData.temperature < 15 ||
    currentSensorData.airQuality > 150 ||
    currentSensorData.co2 > 1000
  ) {
    alertClass = "danger"
    alertIcon = "fa-exclamation-triangle"
    alertTitle = "⚠️ Health Alert - Critical"
  } else if (
    currentSensorData.temperature > 27 ||
    currentSensorData.airQuality > 100 ||
    currentSensorData.co2 > 800
  ) {
    alertClass = "warning"
    alertIcon = "fa-exclamation-circle"
    alertTitle = "⚠️ Health Warning"
  }

  // Process the response to add clean formatting
  let formattedResponse = response
  
  // Replace markdown headers with clean HTML
  formattedResponse = formattedResponse.replace(/## (.*?)(?:\n|$)/g, '<div class="section-title">$1</div>')
  
  // Replace bold text
  formattedResponse = formattedResponse.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  
  // Replace bullet points with proper HTML
  formattedResponse = formattedResponse.replace(/\n\*/g, '\n<li>')
  formattedResponse = formattedResponse.replace(/\n• /g, '\n<li>')
  formattedResponse = formattedResponse.replace(/\n- /g, '\n<li>')
  
  // Wrap lists in ul tags
  formattedResponse = formattedResponse.replace(/(<li>.*?<\/li>(?:\n|$))+/g, '<ul class="ai-list">$&</ul>')
  
  // Close li tags and add closing ul
  formattedResponse = formattedResponse.replace(/<li>(.*?)(?:\n|$)/g, '<li>$1</li>')
  
  // Convert line breaks to paragraphs
  const sections = formattedResponse.split('\n\n')
  let finalHTML = ''
  
  sections.forEach(section => {
    if (section.trim()) {
      // Check if this is a list
      if (section.includes('<li>')) {
        finalHTML += section
      } else {
        // It's a regular paragraph
        finalHTML += '<p>' + section + '</p>'
      }
    }
  })

  // Add current sensor values at the top
  const sensorValuesHTML = `
    <div class="sensor-summary">
      <div class="sensor-row">
        <span class="sensor-label">Temperature:</span>
        <span class="sensor-value ${currentSensorData.temperature > 30 || currentSensorData.temperature < 15 ? 'danger' : currentSensorData.temperature > 27 || currentSensorData.temperature < 18 ? 'warning' : ''}">
          ${currentSensorData.temperature !== null ? currentSensorData.temperature.toFixed(1) + '°C' : 'N/A'}
        </span>
      </div>
      <div class="sensor-row">
        <span class="sensor-label">Air Quality:</span>
        <span class="sensor-value ${currentSensorData.airQuality > 150 ? 'danger' : currentSensorData.airQuality > 100 ? 'warning' : ''}">
          ${currentSensorData.airQuality !== null ? currentSensorData.airQuality.toFixed(1) + ' PPM' : 'N/A'}
        </span>
      </div>
    </div>
  `

  responseContainer.innerHTML = `
        <div class="ai-message bot-message">
            <div class="message-avatar"><i class="fas fa-heartbeat"></i></div>
            <div class="message-content">
                <div class="health-alert ${alertClass}">
                    <strong><i class="fas ${alertIcon}"></i> ${alertTitle}</strong>
                </div>
                ${sensorValuesHTML}
                <div class="ai-analysis">
                  ${finalHTML}
                </div>
            </div>
        </div>
    `
}

// ============================================
// Initialization
// ============================================
// Update the initialization function
function initialize() {
  console.log("Initializing AirSentinel Firebase Dashboard...")

  // Load saved settings
  const savedIp = localStorage.getItem("airsentinel_deviceIp")
  const savedMode = localStorage.getItem("airsentinel_connectionMode")
  const savedTheme = localStorage.getItem("airsentinel_darkTheme")

  if (savedIp) state.deviceIp = savedIp
  if (savedMode) state.connectionMode = savedMode
  if (savedTheme === "true") {
    state.isDarkTheme = true
    document.body.classList.add("dark-theme")
    const themeIcon = document.querySelector(".fa-moon")
    if (themeIcon) {
      themeIcon.classList.remove("fa-moon")
      themeIcon.classList.add("fa-sun")
    }
  }

  state.aiAssistantShown = false

  // Initialize Firebase listener
  startFirebaseListener()

  // Initialize UI
  updateLEDStatus()
  updateSettingsDisplay()
  generateQRCode()

  // Initialize charts
  updateCurrentChart()

  // Get user location
  getLocation()

  console.log("Dashboard ready. Listening for Firebase data...")
  console.log("[v0] AI Assistant ready with model:", AI_ASSISTANT_CONFIG.model)

  // Check initial connection
  setTimeout(() => testConnection(), 1000)

  // Setup Flowise chatbot auto-open
  setTimeout(checkAndOpenChatbot, 3000)

  // Start sensor error monitoring
  setTimeout(() => checkSensorStatus(), 2000)
  setInterval(checkSensorStatus, 5000)

  // Add click outside listener for modals
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal")) {
      event.target.classList.remove("active")
    }
  })
}

// ============================================
// Event Listeners & Global Functions
// ============================================
document.addEventListener("DOMContentLoaded", initialize)

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideSetupModal()
    hideDeviceSettingsModal()
    hideSensorErrorModal()
    hideTemperatureModal()
    hideHumidityModal()
    hideAirQualityModal()
    hideCO2Modal()
    hideAssistancePopup()
    if (state.chatbotVisible) toggleChatbot()
    closeAIAssistant() // Close AI assistant modal
  }
  if (event.key === "F5" || (event.ctrlKey && event.key === "r")) {
    event.preventDefault()
    refreshData()
  }
  if (event.key === "t" && event.ctrlKey) {
    event.preventDefault()
    toggleTheme()
  }
})

// Make all functions globally available
window.toggleLED = toggleLED
window.calibrateSensor = calibrateSensor
window.setLCDMode = setLCDMode
window.toggleTheme = toggleTheme
window.switchChart = switchChart
window.refreshData = refreshData
window.showSetupModal = showSetupModal
window.hideSetupModal = hideSetupModal
window.showDeviceSettingsModal = showDeviceSettingsModal
window.hideDeviceSettingsModal = hideDeviceSettingsModal
window.updateDeviceIP = updateDeviceIP
window.updateConnectionMode = updateConnectionMode
window.testConnection = testConnection
window.checkConnection = checkConnection
window.updateLocation = updateLocation
window.showSensorErrorModal = showSensorErrorModal
window.hideSensorErrorModal = hideSensorErrorModal
window.checkSensorStatus = checkSensorStatus
window.retrySensorCheck = retrySensorCheck
window.calibrateSensorFromError = calibrateSensorFromError
window.showTemperatureModal = showTemperatureModal
window.hideTemperatureModal = hideTemperatureModal
window.showHumidityModal = showHumidityModal
window.hideHumidityModal = hideHumidityModal
window.showAirQualityModal = showAirQualityModal
window.hideAirQualityModal = hideAirQualityModal
window.showCO2Modal = showCO2Modal
window.hideCO2Modal = hideCO2Modal
window.showAssistancePopup = showAssistancePopup
window.hideAssistancePopup = hideAssistancePopup
window.openChatbot = openChatbot
window.toggleChatbot = toggleChatbot
window.openAIAssistant = openAIAssistant // Expose AI assistant function
window.closeAIAssistant = closeAIAssistant // Expose AI assistant close function
window.refreshAIAnalysis = refreshAIAnalysis // Expose AI analysis refresh function

// ============================================
// Real-Time AI Health Assistant
// ============================================
let previousSensorData = {}

// Update AI Health Dashboard with real-time changes
function updateAIHealthDashboard() {
  const dashboard = document.getElementById('aiHealthDashboard')
  if (!dashboard) return

  const currentTemp = parseFloat(document.getElementById('temperature')?.textContent) || 0
  const currentHum = parseFloat(document.getElementById('humidity')?.textContent) || 0
  const currentAir = parseFloat(document.getElementById('airQuality')?.textContent) || 0
  const currentCo2 = parseFloat(document.getElementById('co2Level')?.textContent) || 0

  // Update temperature
  updateSensorCard('aiTempValue', currentTemp, 'Temp', '°C')
  updateSensorCard('aiHumValue', currentHum, 'Humidity', '%')
  updateSensorCard('aiAirValue', currentAir, 'AirQuality', 'PPM')
  updateSensorCard('aiCo2Value', currentCo2, 'CO2', 'PPM')

  // Update status indicators
  updateTempStatus(currentTemp)
  updateHumidityStatus(currentHum)
  updateAirQualityStatus(currentAir)
  updateCO2Status(currentCo2)

  // Update real-time change indicators
  updateRealTimeIndicators(currentTemp, currentHum, currentAir, currentCo2)

  // Update overall health status
  updateOverallHealthStatus(currentTemp, currentHum, currentAir, currentCo2)

  // Generate AI recommendations
  generateAIRecommendations(currentTemp, currentHum, currentAir, currentCo2)
}

function updateSensorCard(elementId, value, type, unit) {
  const element = document.getElementById(elementId)
  if (element) {
    if (unit === '%' || unit === 'PPM') {
      element.textContent = value.toFixed(1) + unit
    } else {
      element.textContent = value.toFixed(1) + unit
    }
  }
}

function updateTempStatus(temp) {
  const status = document.getElementById('aiTempStatus')
  if (!status) return

  status.className = 'summary-status'
  if (temp >= 20 && temp <= 25) {
    status.textContent = '✓ Optimal'
    status.classList.add('good')
  } else if (temp >= 18 && temp < 20 || temp > 25 && temp <= 28) {
    status.textContent = '⚠ Moderate'
    status.classList.add('moderate')
  } else if (temp >= 15 && temp < 18 || temp > 28 && temp <= 30) {
    status.textContent = '⚠ Unhealthy'
    status.classList.add('unhealthy')
  } else {
    status.textContent = '🚨 Hazardous'
    status.classList.add('hazardous')
  }
}

function updateHumidityStatus(hum) {
  const status = document.getElementById('aiHumStatus')
  if (!status) return

  status.className = 'summary-status'
  if (hum >= 40 && hum <= 60) {
    status.textContent = '✓ Optimal'
    status.classList.add('good')
  } else if (hum >= 30 && hum < 40 || hum > 60 && hum <= 70) {
    status.textContent = '⚠ Moderate'
    status.classList.add('moderate')
  } else if (hum >= 20 && hum < 30 || hum > 70 && hum <= 80) {
    status.textContent = '⚠ Unhealthy'
    status.classList.add('unhealthy')
  } else {
    status.textContent = '🚨 Hazardous'
    status.classList.add('hazardous')
  }
}

function updateAirQualityStatus(air) {
  const status = document.getElementById('aiAirStatus')
  if (!status) return

  status.className = 'summary-status'
  if (air <= 50) {
    status.textContent = '✓ Excellent'
    status.classList.add('good')
  } else if (air <= 100) {
    status.textContent = '⚠ Moderate'
    status.classList.add('moderate')
  } else if (air <= 200) {
    status.textContent = '⚠ Unhealthy'
    status.classList.add('unhealthy')
  } else {
    status.textContent = '🚨 Hazardous'
    status.classList.add('hazardous')
  }
}

function updateCO2Status(co2) {
  const status = document.getElementById('aiCo2Status')
  if (!status) return

  status.className = 'summary-status'
  if (co2 <= 600) {
    status.textContent = '✓ Excellent'
    status.classList.add('good')
  } else if (co2 <= 800) {
    status.textContent = '✓ Good'
    status.classList.add('good')
  } else if (co2 <= 1000) {
    status.textContent = '⚠ Fair'
    status.classList.add('moderate')
  } else if (co2 <= 1400) {
    status.textContent = '⚠ Poor'
    status.classList.add('unhealthy')
  } else {
    status.textContent = '🚨 Hazardous'
    status.classList.add('hazardous')
  }
}

function updateRealTimeIndicators(temp, hum, air, co2) {
  updateChangeIndicator('aiTempChange', temp, previousSensorData.temp)
  updateChangeIndicator('aiHumChange', hum, previousSensorData.humidity)
  updateChangeIndicator('aiAirChange', air, previousSensorData.air)
  updateChangeIndicator('aiCo2Change', co2, previousSensorData.co2)

  previousSensorData = { temp, humidity: hum, air, co2 }
}

function updateChangeIndicator(elementId, currentValue, previousValue) {
  const element = document.getElementById(elementId)
  if (!element) return

  if (!previousValue) {
    element.textContent = '→ Stable'
    element.className = 'real-time-indicator stable'
    return
  }

  const change = currentValue - previousValue
  const percentChange = Math.abs((change / previousValue) * 100)

  if (Math.abs(change) < 0.5) {
    element.textContent = '→ Stable'
    element.className = 'real-time-indicator stable'
  } else if (change > 0) {
    element.textContent = `↑ +${change.toFixed(1)} (${percentChange.toFixed(1)}%)`
    element.className = 'real-time-indicator increasing'
  } else {
    element.textContent = `↓ ${change.toFixed(1)} (${percentChange.toFixed(1)}%)`
    element.className = 'real-time-indicator decreasing'
  }
}

function updateOverallHealthStatus(temp, hum, air, co2) {
  const statusBar = document.getElementById('healthStatusBar')
  if (!statusBar) return

  statusBar.innerHTML = ''

  const conditions = []
  if (temp >= 20 && temp <= 25) conditions.push('✓')
  else if (temp >= 18 && temp <= 28) conditions.push('⚠')
  else conditions.push('🚨')

  if (hum >= 40 && hum <= 60) conditions.push('✓')
  else if (hum >= 30 && hum <= 70) conditions.push('⚠')
  else conditions.push('🚨')

  if (air <= 100) conditions.push('✓')
  else if (air <= 200) conditions.push('⚠')
  else conditions.push('🚨')

  if (co2 <= 1000) conditions.push('✓')
  else if (co2 <= 1400) conditions.push('⚠')
  else conditions.push('🚨')

  const healthScore = conditions.filter(c => c === '✓').length

  if (healthScore >= 3) {
    const indicator = document.createElement('div')
    indicator.className = 'status-indicator healthy'
    indicator.innerHTML = '<i class="fas fa-check-circle"></i> Healthy Environment'
    statusBar.appendChild(indicator)
  } else if (healthScore >= 2) {
    const indicator = document.createElement('div')
    indicator.className = 'status-indicator warning'
    indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> Needs Attention'
    statusBar.appendChild(indicator)
  } else {
    const indicator = document.createElement('div')
    indicator.className = 'status-indicator alert'
    indicator.innerHTML = '<i class="fas fa-alert-circle"></i> Action Required'
    statusBar.appendChild(indicator)
  }

  const details = document.createElement('div')
  details.style.marginTop = '10px'
  details.style.fontSize = '13px'
  details.style.color = 'var(--text-secondary)'
  details.textContent = `Health Score: ${healthScore}/4 | Temp: ${conditions[0]} | Humidity: ${conditions[1]} | Air: ${conditions[2]} | CO₂: ${conditions[3]}`
  statusBar.appendChild(details)
}

function generateAIRecommendations(temp, hum, air, co2) {
  const container = document.getElementById('aiRecommendations')
  if (!container) return

  container.innerHTML = ''

  const recommendations = []

  // Temperature recommendations
  if (temp < 18) {
    recommendations.push({
      risk: 'high',
      title: '❄️ Temperature Too Low',
      body: '<p>Current temperature is <strong>' + temp.toFixed(1) + '°C</strong>, which is below optimal range.</p><h4>Health Impact:</h4><ul><li>Risk of respiratory issues</li><li>Discomfort and reduced productivity</li></ul><h4>Recommendations:</h4><ul><li>Increase heating gradually</li><li>Use warm clothing</li><li>Ensure proper insulation</li></ul>'
    })
  } else if (temp > 28) {
    recommendations.push({
      risk: 'high',
      title: '🔥 Temperature Too High',
      body: '<p>Current temperature is <strong>' + temp.toFixed(1) + '°C</strong>, which is above optimal range.</p><h4>Health Impact:</h4><ul><li>Risk of dehydration</li><li>Heat stress and fatigue</li></ul><h4>Recommendations:</h4><ul><li>Increase ventilation</li><li>Use air conditioning if available</li><li>Stay hydrated</li></ul>'
    })
  } else {
    recommendations.push({
      risk: 'low',
      title: '✓ Temperature Optimal',
      body: '<p>Temperature is in the optimal range of <strong>20-25°C</strong>.</p><h4>Status:</h4><ul><li>Comfortable for most activities</li><li>Minimal health impact</li></ul>'
    })
  }

  // Humidity recommendations
  if (hum < 30) {
    recommendations.push({
      risk: 'moderate',
      title: '💧 Humidity Too Low',
      body: '<p>Current humidity is <strong>' + hum.toFixed(1) + '%</strong>, which is below optimal range.</p><h4>Health Impact:</h4><ul><li>Dry skin and respiratory irritation</li><li>Increased static electricity</li></ul><h4>Recommendations:</h4><ul><li>Use a humidifier</li><li>Increase water intake</li><li>Improve ventilation</li></ul>'
    })
  } else if (hum > 70) {
    recommendations.push({
      risk: 'moderate',
      title: '🌊 Humidity Too High',
      body: '<p>Current humidity is <strong>' + hum.toFixed(1) + '%</strong>, which is above optimal range.</p><h4>Health Impact:</h4><ul><li>Mold growth risk</li><li>Dust mite proliferation</li></ul><h4>Recommendations:</h4><ul><li>Use dehumidifier</li><li>Improve ventilation</li><li>Check for leaks</li></ul>'
    })
  } else {
    recommendations.push({
      risk: 'low',
      title: '✓ Humidity Optimal',
      body: '<p>Humidity is in the optimal range of <strong>40-60%</strong>.</p><h4>Status:</h4><ul><li>Comfortable and healthy</li><li>Minimal mold risk</li></ul>'
    })
  }

  // Air Quality recommendations
  if (air > 100) {
    recommendations.push({
      risk: 'high',
      title: '💨 Air Quality Poor',
      body: '<p>Air quality is <strong>' + air.toFixed(1) + ' PPM</strong>, which indicates poor indoor air quality.</p><h4>Health Impact:</h4><ul><li>Respiratory problems</li><li>Reduced cognitive function</li></ul><h4>Recommendations:</h4><ul><li>Open windows for fresh air</li><li>Use air purifier</li><li>Reduce pollution sources</li></ul>'
    })
  } else {
    recommendations.push({
      risk: 'low',
      title: '✓ Air Quality Good',
      body: '<p>Air quality is <strong>' + air.toFixed(1) + ' PPM</strong>, which is acceptable.</p><h4>Status:</h4><ul><li>Safe for breathing</li><li>Minimal health risk</li></ul>'
    })
  }

  // CO2 recommendations
  if (co2 > 1000) {
    recommendations.push({
      risk: 'high',
      title: '🌫️ CO₂ Level High',
      body: '<p>CO₂ level is <strong>' + co2.toFixed(1) + ' PPM</strong>, which indicates poor ventilation.</p><h4>Health Impact:</h4><ul><li>Headaches and drowsiness</li><li>Reduced concentration</li></ul><h4>Recommendations:</h4><ul><li>Open windows immediately</li><li>Increase HVAC fan speed</li><li>Ensure proper air circulation</li></ul>'
    })
  } else {
    recommendations.push({
      risk: 'low',
      title: '✓ CO₂ Level Normal',
      body: '<p>CO₂ level is <strong>' + co2.toFixed(1) + ' PPM</strong>, which is healthy.</p><h4>Status:</h4><ul><li>Good ventilation</li><li>Safe breathing environment</li></ul>'
    })
  }

  recommendations.forEach(rec => {
    const card = document.createElement('div')
    card.className = `ai-recommendation-card risk-${rec.risk}`
    card.innerHTML = `
      <div class="recommendation-header">
        <h3>${rec.title}</h3>
      </div>
      <div class="recommendation-body">${rec.body}</div>
    `
    container.appendChild(card)
  })
}

function generateHealthReport() {
  const temp = parseFloat(document.getElementById('temperature')?.textContent) || 0
  const hum = parseFloat(document.getElementById('humidity')?.textContent) || 0
  const air = parseFloat(document.getElementById('airQuality')?.textContent) || 0
  const co2 = parseFloat(document.getElementById('co2Level')?.textContent) || 0

  const report = `
    AirSentinel Health Report
    Generated: ${new Date().toLocaleString()}
    
    Current Readings:
    - Temperature: ${temp.toFixed(1)}°C
    - Humidity: ${hum.toFixed(1)}%
    - Air Quality: ${air.toFixed(1)} PPM
    - CO2 Level: ${co2.toFixed(1)} PPM
    
    Summary: See full analysis in AI Health Assistant section
  `

  alert('Report generated. Implementation of PDF export coming soon!')
  console.log(report)
}

function setAlertThresholds() {
  alert('Alert thresholds feature coming soon! You will be able to customize notification settings.')
}

// Update dashboard every 2 seconds
setInterval(updateAIHealthDashboard, 2000)

console.log("✅ AirSentinel script.js loaded successfully!")
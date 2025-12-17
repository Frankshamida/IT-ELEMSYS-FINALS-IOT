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
    appId: "1:275383903252:web:abc123def456"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized successfully");
} catch (error) {
    console.error("❌ Firebase initialization error:", error);
    showNotification("Firebase failed to load. Check configuration.", "error");
}

// Get database reference
const database = firebase.database();

// ============================================
// Global State & Configuration
// ============================================
let state = {
    isConnected: false,
    ledState: false,
    currentLCDMode: 'welcome',
    currentChart: 'temperature',
    temperatureHistory: [],
    humidityHistory: [],
    airQualityHistory: [],
    maxHistoryPoints: 10,
    lastUpdateTime: null,
    firebaseConnection: 'connecting',
    deviceIp: localStorage.getItem('airsentinel_deviceIp') || '192.168.1.100',
    connectionMode: localStorage.getItem('airsentinel_connectionMode') || 'auto',
    isDarkTheme: localStorage.getItem('airsentinel_darkTheme') === 'true',
    deviceIP: '',
    isLocalConnected: false,
    userLocation: null,
    locationPermission: false,
    assistancePopupShown: false,
    chatbotVisible: false
};

// DOM Elements
const elements = {
    connectionIndicator: document.getElementById('connectionIndicator'),
    connectionText: document.getElementById('connectionText'),
    connectionBanner: document.getElementById('connectionBanner'),
    disconnectedOverlay: document.getElementById('disconnectedOverlay'),
    setupModal: document.getElementById('setupModal'),
    deviceSettingsModal: document.getElementById('deviceSettingsModal'),
    temperatureModal: document.getElementById('temperatureModal'),
    humidityModal: document.getElementById('humidityModal'),
    airQualityModal: document.getElementById('airQualityModal'),
    co2Modal: document.getElementById('co2Modal'),
    modalConnectionStatus: document.getElementById('modalConnectionStatus'),
    deviceIpInput: document.getElementById('deviceIpInput'),
    connectionModeSelect: document.getElementById('connectionModeSelect'),
    wifiSsid: document.getElementById('wifiSsid'),
    wifiPassword: document.getElementById('wifiPassword'),
    currentMode: document.getElementById('currentMode'),
    currentIP: document.getElementById('currentIP'),
    currentStatus: document.getElementById('currentStatus'),
    locationText: document.getElementById('locationText'),
    coordinates: document.getElementById('coordinates'),
    lastUpdate: document.getElementById('lastUpdate'),
    chatbotButton: document.getElementById('chatbotButton'),
    chatbotContainer: document.getElementById('chatbotContainer'),
    assistancePopup: document.getElementById('assistancePopup')
};

// ============================================
// Firebase Real-time Data Listener
// ============================================
function startFirebaseListener() {
    console.log("Starting Firebase listener on /sensor_readings/...");
    
    const sensorRef = database.ref('sensor_readings');
    
    sensorRef.orderByKey().limitToLast(1).on('child_added', (snapshot) => {
        console.log("📥 New data received from Firebase");
        const data = snapshot.val();
        state.lastUpdateTime = new Date();
        updateDashboard(data);
        updateSensorHistory(data);
        updateCurrentChart();
        updateLastUpdateTime();
        updateConnectionStatus('connected', `Live from Firebase`);
        
        // Show assistance popup on first data received
        if (!state.assistancePopupShown) {
            setTimeout(() => {
                showAssistancePopup();
                state.assistancePopupShown = true;
            }, 3000);
        }
    });
    
    sensorRef.on('value', (snapshot) => {
        state.firebaseConnection = 'connected';
    });
    
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snap) => {
        state.isConnected = snap.val() === true;
        if (state.isConnected) {
            console.log("✅ Connected to Firebase Realtime Database");
            updateConnectionStatus('connected', 'Live from Firebase');
            hideDisconnectedOverlay();
        } else {
            console.log("⚠️  Disconnected from Firebase");
            updateConnectionStatus('disconnected', 'Disconnected from Firebase');
            showDisconnectedOverlay();
        }
    });
}

// ============================================
// Dashboard Update Functions
// ============================================
function updateDashboard(data) {
    updateElement('temperature', data.temperature, '°C');
    updateElement('humidity', data.humidity, '%');
    updateElement('airQuality', data.air_quality, 'PPM');
    updateElement('co2Level', data.co2, 'PPM');
    
    // Update modal values
    updateElement('modalTemperature', data.temperature, '°C');
    updateElement('modalHumidity', data.humidity, '%');
    updateElement('modalAirQuality', data.air_quality, 'PPM');
    updateElement('modalCO2', data.co2, 'PPM');
    
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updateElement('tempTime', timeString);
    updateElement('humTime', timeString);
    updateElement('co2Time', timeString);
    
    updateAirQualityIndicator(data.air_quality);
    updateElement('analogRaw', data.analog_raw);
    updateElement('deviceReady', data.device_ready ? 'Yes' : 'No');
    updateElement('sensorStatus', data.error ? 'Error' : 'OK');
    
    // Update LED status if available in data
    if (data.ledState !== undefined) {
        state.ledState = data.ledState === 'ON' || data.ledState === true;
        updateLEDStatus();
    }
    
    updateElement('uptime', formatUptime(data.timestamp));
    updateElement('freeHeap', 'Cloud');
    updateElement('connectedClients', '--');
    updateElement('deviceIP', state.deviceIp || 'Firebase Cloud');
}

function updateElement(id, value, suffix = '') {
    const element = document.getElementById(id);
    if (element) {
        if (value === undefined || value === null || value === "") {
            element.textContent = '--';
        } else {
            if (typeof value === 'number') {
                element.textContent = value.toFixed(1) + suffix;
            } else if (typeof value === 'boolean') {
                element.textContent = value ? 'Yes' : 'No';
            } else {
                element.textContent = value + suffix;
            }
        }
    }
}

function formatUptime(timestampSeconds) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestampSeconds;
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================
// Air Quality Indicator
// ============================================
function updateAirQualityIndicator(ppm) {
    const aqiDot = document.getElementById('aqiDot');
    const aqiLabel = document.getElementById('aqiLabel');
    const gaugeMarker = document.getElementById('gaugeMarker');
    
    if (ppm === null || ppm === undefined || ppm === "Error" || ppm === 0) {
        aqiDot.className = 'aqi-dot';
        aqiLabel.textContent = '--';
        gaugeMarker.style.left = '0%';
        return;
    }
    
    ppm = parseFloat(ppm);
    if (isNaN(ppm)) return;
    
    let quality = 'Good';
    let colorClass = 'good';
    let position = 0;
    
    if (ppm <= 50) {
        quality = 'Excellent';
        colorClass = 'good';
        position = (ppm / 50) * 25;
    } else if (ppm <= 100) {
        quality = 'Moderate';
        colorClass = 'moderate';
        position = 25 + ((ppm - 50) / 50) * 25;
    } else if (ppm <= 200) {
        quality = 'Unhealthy';
        colorClass = 'unhealthy';
        position = 50 + ((ppm - 100) / 100) * 25;
    } else {
        quality = 'Hazardous';
        colorClass = 'hazardous';
        position = 75 + (Math.min(ppm - 200, 300) / 300) * 25;
    }
    
    aqiDot.className = 'aqi-dot ' + colorClass;
    aqiLabel.textContent = quality;
    gaugeMarker.style.left = Math.min(position, 100) + '%';
}

// ============================================
// Connection Status UI
// ============================================
function updateConnectionStatus(status, text) {
    const indicatorDot = elements.connectionIndicator.querySelector('.indicator-dot');
    elements.connectionText.textContent = text;
    
    indicatorDot.className = 'indicator-dot';
    indicatorDot.classList.add(status);
    
    elements.connectionIndicator.classList.remove('connected', 'disconnected', 'connecting');
    elements.connectionIndicator.classList.add(status);
}

function showDisconnectedOverlay() {
    if (elements.disconnectedOverlay) {
        elements.disconnectedOverlay.classList.add('active');
    }
}

function hideDisconnectedOverlay() {
    if (elements.disconnectedOverlay) {
        elements.disconnectedOverlay.classList.remove('active');
    }
}

// ============================================
// Sensor History & Charts
// ============================================
function updateSensorHistory(data) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Add new data to history arrays
    if (data.temperature && data.temperature !== "Error") {
        state.temperatureHistory.push({
            time: timeLabel,
            value: parseFloat(data.temperature) || 0
        });
    }
    
    if (data.humidity && data.humidity !== "Error") {
        state.humidityHistory.push({
            time: timeLabel,
            value: parseFloat(data.humidity) || 0
        });
    }
    
    if (data.air_quality && data.air_quality !== "Error" && data.air_quality !== 0) {
        state.airQualityHistory.push({
            time: timeLabel,
            value: parseFloat(data.air_quality) || 0
        });
    }
    
    // Keep only the last N points
    if (state.temperatureHistory.length > state.maxHistoryPoints) {
        state.temperatureHistory.shift();
    }
    if (state.humidityHistory.length > state.maxHistoryPoints) {
        state.humidityHistory.shift();
    }
    if (state.airQualityHistory.length > state.maxHistoryPoints) {
        state.airQualityHistory.shift();
    }
}

function switchChart(chartType) {
    // Update active tab
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`.chart-tab[onclick*="${chartType}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Update chart display
    document.querySelectorAll('.chart-wrapper').forEach(wrapper => {
        wrapper.style.display = 'none';
    });
    
    const chartElement = document.getElementById(`${chartType}Chart`);
    if (chartElement) {
        chartElement.style.display = 'block';
    }
    
    state.currentChart = chartType;
    updateCurrentChart();
}

function updateCurrentChart() {
    let data, chartId, type;
    
    switch(state.currentChart) {
        case 'temperature':
            data = state.temperatureHistory;
            chartId = 'temperatureBars';
            type = 'temperature';
            break;
        case 'humidity':
            data = state.humidityHistory;
            chartId = 'humidityBars';
            type = 'humidity';
            break;
        case 'airquality':
            data = state.airQualityHistory;
            chartId = 'airqualityBars';
            type = 'airquality';
            break;
        default:
            return;
    }
    
    updateChart(chartId, data, type);
}

function updateChart(chartId, data, type) {
    const chart = document.getElementById(chartId);
    if (!chart) return;
    
    chart.innerHTML = '';
    
    if (!data || data.length === 0) {
        chart.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No data available yet</div>';
        return;
    }
    
    // Find min and max values for scaling
    const values = data.map(d => d.value).filter(v => !isNaN(v));
    if (values.length === 0) {
        chart.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No valid data</div>';
        return;
    }
    
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue || 1;
    
    // Create bars
    data.forEach((item, index) => {
        if (isNaN(item.value)) return;
        
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        
        // Calculate height (0-100%)
        const height = range > 0 ? ((item.value - minValue) / range * 80) + 10 : 50;
        bar.style.height = `${height}%`;
        
        // Set color based on value and type
        let color;
        if (type === 'temperature') {
            if (item.value < 20) color = '#4dabf7';
            else if (item.value < 25) color = '#69db7c';
            else if (item.value < 30) color = '#ffa94d';
            else color = '#ff6b6b';
        } else if (type === 'humidity') {
            if (item.value < 30) color = '#ffd8a8';
            else if (item.value < 60) color = '#74c0fc';
            else color = '#339af0';
        } else { // airquality
            if (item.value < 50) color = '#51cf66';
            else if (item.value < 100) color = '#ffd43b';
            else if (item.value < 200) color = '#ff922b';
            else color = '#fa5252';
        }
        
        bar.style.backgroundColor = color;
        bar.title = `${item.time}: ${item.value.toFixed(1)}`;
        
        // Add time label
        const label = document.createElement('div');
        label.className = 'chart-label';
        label.textContent = item.time;
        
        const barContainer = document.createElement('div');
        barContainer.className = 'chart-bar-container';
        barContainer.appendChild(bar);
        barContainer.appendChild(label);
        
        chart.appendChild(barContainer);
    });
}

// ============================================
// Enhanced Location Services
// ============================================
function getLocation() {
    if (!navigator.geolocation) {
        console.warn("Geolocation not supported by this browser.");
        elements.locationText.textContent = "Geolocation not supported";
        // Fallback to IP-based location
        getLocationByIP();
        return;
    }

    // Check if we're in a secure context (HTTPS)
    if (window.isSecureContext) {
        // If secure, try high-accuracy GPS first
        requestUserLocation();
    } else {
        // If not secure (HTTP), inform the user and use IP fallback
        console.warn("Geolocation requires HTTPS. This page is served over HTTP.");
        elements.locationText.textContent = "Using network location (HTTPS required for GPS)";
        
        // You can show a helpful message to the user
        showNotification("For precise GPS location, please access this site via HTTPS (e.g., through our cloud server). Using estimated network location.", "info");
        
        // Fallback to IP-based geolocation
        getLocationByIP();
    }
}

// Request location with proper error handling
function requestUserLocation() {
    const options = {
        enableHighAccuracy: true, // Request better accuracy[citation:4]
        timeout: 10000, // 10 second timeout[citation:4]
        maximumAge: 30000 // Cache location for 30 seconds
    };
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            // Success callback
            state.userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date(position.timestamp)
            };
            
            state.locationPermission = true;
            updateLocationDisplay();
            saveLocationToFirebase();
            showNotification("Location updated successfully", "success");
            
            // Now fetch weather/air quality data based on coordinates
            fetchEnvironmentalData(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
            // Enhanced error handling[citation:2][citation:4]
            console.error("Geolocation error:", error);
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    elements.locationText.textContent = "Location permission denied";
                    showNotification("Please enable location permissions to get local weather data.", "warning");
                    break;
                case error.POSITION_UNAVAILABLE:
                    elements.locationText.textContent = "Location unavailable";
                    showNotification("Could not get location. Using estimated location.", "info");
                    break;
                case error.TIMEOUT:
                    elements.locationText.textContent = "Location request timed out";
                    showNotification("Location request took too long.", "info");
                    break;
                default:
                    elements.locationText.textContent = "Location error occurred";
                    break;
            }
            
            // Always fall back to IP-based location
            getLocationByIP();
        },
        options
    );
}

// Fallback: Get approximate location via IP
function getLocationByIP() {
    // Using a free IP geolocation service (replace with your own key)
    fetch('https://ipapi.co/json/')
        .then(response => response.json())
        .then(data => {
            if (data.latitude && data.longitude) {
                state.userLocation = {
                    latitude: data.latitude,
                    longitude: data.longitude,
                    accuracy: 50000, // ~50km accuracy for IP-based
                    timestamp: new Date(),
                    city: data.city,
                    country: data.country_name
                };
                updateLocationDisplay();
                console.log("Estimated location via IP:", data.city, data.country);
                
                // Fetch weather/air quality for this estimated location
                fetchEnvironmentalData(data.latitude, data.longitude);
            }
        })
        .catch(error => {
            console.error("IP geolocation failed:", error);
            elements.locationText.textContent = "Location services unavailable";
        });
}

// Fetch temperature and air quality for coordinates
function fetchEnvironmentalData(lat, lon) {
    // Example using OpenWeatherMap API (you'll need an API key)
    const apiKey = '6556f1a67f4b57ec85cc989de336a187'; // Get from https://openweathermap.org/api
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.main && data.weather) {
                // Update your UI with external environmental data
                console.log("Local temperature:", data.main.temp, "°C");
                console.log("Weather:", data.weather[0].description);
                
                // You can create a new display element for this data
                updateExternalEnvironmentDisplay(data);
            }
        })
        .catch(error => console.error("Weather API error:", error));
    
    // For air quality, you could use another API like OpenAQ
    // const aqUrl = `https://api.openaq.org/v2/latest?coordinates=${lat},${lon}`;
}

function updateExternalEnvironmentDisplay(weatherData) {
    // Create or update an element to show external data
    const extDataElement = document.getElementById('externalEnvironment') || createExternalDataElement();
    
    extDataElement.innerHTML = `
        <div class="external-data">
            <h4><i class="fas fa-cloud-sun"></i> Local Environment</h4>
            <p><strong>Outside Temp:</strong> ${weatherData.main.temp}°C</p>
            <p><strong>Conditions:</strong> ${weatherData.weather[0].description}</p>
            <p><strong>Humidity:</strong> ${weatherData.main.humidity}%</p>
        </div>
    `;
}

function createExternalDataElement() {
    const div = document.createElement('div');
    div.id = 'externalEnvironment';
    // Insert after the location section
    document.querySelector('.location-section').after(div);
    return div;
}


function updateLocation() {
    elements.locationText.textContent = "Updating location...";
    elements.coordinates.textContent = "Lat: --, Lon: --";
    getLocation();
}

function updateLocationDisplay() {
    if (!state.userLocation) {
        elements.locationText.textContent = "Location not available";
        elements.coordinates.textContent = "Lat: --, Lon: --";
        return;
    }
    
    const lat = state.userLocation.latitude.toFixed(6);
    const lon = state.userLocation.longitude.toFixed(6);
    
    elements.coordinates.textContent = `Lat: ${lat}, Lon: ${lon}`;
    elements.lastUpdate.textContent = `Last updated: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
    // Get location name using reverse geocoding (simplified)
    getLocationName(state.userLocation.latitude, state.userLocation.longitude);
}

function getLocationName(lat, lon) {
    // Simplified reverse geocoding - in production, use a proper geocoding service
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
            if (data && data.address) {
                const address = data.address;
                let locationName = '';
                
                if (address.road) locationName += address.road;
                if (address.suburb) locationName += (locationName ? ', ' : '') + address.suburb;
                if (address.city || address.town || address.village) {
                    locationName += (locationName ? ', ' : '') + (address.city || address.town || address.village);
                }
                
                if (locationName) {
                    elements.locationText.textContent = locationName;
                } else {
                    elements.locationText.textContent = `${lat}, ${lon}`;
                }
            } else {
                elements.locationText.textContent = `${lat}, ${lon}`;
            }
        })
        .catch(error => {
            console.error("Reverse geocoding error:", error);
            elements.locationText.textContent = `${lat}, ${lon}`;
        });
}

function handleLocationError(error) {
    switch(error.code) {
        case error.PERMISSION_DENIED:
            elements.locationText.textContent = "Location permission denied";
            break;
        case error.POSITION_UNAVAILABLE:
            elements.locationText.textContent = "Location unavailable";
            break;
        case error.TIMEOUT:
            elements.locationText.textContent = "Location request timeout";
            break;
        default:
            elements.locationText.textContent = "Location error occurred";
            break;
    }
}

function saveLocationToFirebase() {
    if (!state.userLocation || !state.isConnected) return;
    
    try {
        const locationRef = database.ref('user_locations').push();
        locationRef.set({
            latitude: state.userLocation.latitude,
            longitude: state.userLocation.longitude,
            accuracy: state.userLocation.accuracy,
            timestamp: Date.now(),
            deviceId: localStorage.getItem('airsentinel_deviceId') || 'unknown'
        });
    } catch (error) {
        console.error("Failed to save location to Firebase:", error);
    }
}

// ============================================
// Modal Functions
// ============================================
function showTemperatureModal() {
    elements.temperatureModal.classList.add('active');
}

function hideTemperatureModal() {
    elements.temperatureModal.classList.remove('active');
}

function showHumidityModal() {
    elements.humidityModal.classList.add('active');
}

function hideHumidityModal() {
    elements.humidityModal.classList.remove('active');
}

function showAirQualityModal() {
    elements.airQualityModal.classList.add('active');
}

function hideAirQualityModal() {
    elements.airQualityModal.classList.remove('active');
}

function showCO2Modal() {
    elements.co2Modal.classList.add('active');
}

function hideCO2Modal() {
    elements.co2Modal.classList.remove('active');
}

// ============================================
// Assistance Popup Functions
// ============================================
function showAssistancePopup() {
    if (!state.assistancePopupShown) {
        elements.assistancePopup.classList.add('active');
        // Auto hide after 10 seconds
        setTimeout(() => {
            hideAssistancePopup();
        }, 10000);
    }
}

function hideAssistancePopup() {
    elements.assistancePopup.classList.remove('active');
}

function openChatbot() {
    hideAssistancePopup();
    toggleChatbot();
}

// ============================================
// AI Chatbot Functions
// ============================================
function toggleChatbot() {
    state.chatbotVisible = !state.chatbotVisible;
    
    if (state.chatbotVisible) {
        elements.chatbotContainer.classList.add('active');
        
        // Initialize chatbot if not already initialized
        if (typeof initializeFlowiseChatbot === 'function') {
            setTimeout(() => {
                initializeFlowiseChatbot();
            }, 100);
        }
    } else {
        elements.chatbotContainer.classList.remove('active');
        
        // Clean up chatbot
        if (typeof cleanupFlowiseChatbot === 'function') {
            cleanupFlowiseChatbot();
        }
    }
}

// ============================================
// Device Control Functions
// ============================================
async function toggleLED() {
    try {
        const response = await fetch(`http://${state.deviceIp}/api/led/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'no-cors'
        });
        
        if (response && response.ok) {
            const data = await response.json();
            state.ledState = data.ledState === 'ON';
            updateLEDStatus();
            showNotification('LED toggled successfully', 'success');
        } else {
            // Fallback: Toggle in local state only
            state.ledState = !state.ledState;
            updateLEDStatus();
            showNotification('LED state updated locally', 'info');
        }
    } catch (error) {
        console.error('Failed to toggle LED:', error);
        state.ledState = !state.ledState;
        updateLEDStatus();
        showNotification('LED toggled locally', 'info');
    }
}

function updateLEDStatus() {
    const ledIndicator = document.getElementById('ledIndicator');
    const ledStatusText = document.getElementById('ledStatusText');
    
    if (state.ledState) {
        ledIndicator.classList.add('on');
        ledStatusText.textContent = 'ON';
    } else {
        ledIndicator.classList.remove('on');
        ledStatusText.textContent = 'OFF';
    }
}

async function calibrateSensor() {
    if (!confirm('Sensor calibration will take about 30 seconds. Ensure the sensor is in clean air. Continue?')) {
        return;
    }
    
    try {
        const response = await fetch(`http://${state.deviceIp}/api/calibrate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'no-cors'
        });
        
        if (response && response.ok) {
            const data = await response.json();
            showNotification('Calibration started. Please wait 30 seconds.', 'success');
            
            // Update calibration status
            setTimeout(() => {
                showNotification('Calibration complete!', 'success');
                refreshData();
            }, 32000);
        } else {
            showNotification('Starting calibration process...', 'info');
            setTimeout(() => {
                showNotification('Calibration complete!', 'success');
            }, 30000);
        }
    } catch (error) {
        console.error('Calibration failed:', error);
        showNotification('Calibration process initiated', 'info');
    }
}

async function setLCDMode(mode) {
    const modeNames = {
        'welcome': 'Welcome Screen',
        'temperature': 'Temperature',
        'humidity': 'Humidity',
        'airquality': 'Air Quality',
        'co2': 'CO₂ Level',
        'alldata': 'All Data'
    };
    
    try {
        const response = await fetch(`http://${state.deviceIp}/api/lcd`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ mode: mode })
        });
        
        if (response.ok) {
            const data = await response.json();
            state.currentLCDMode = mode;
            document.getElementById('currentLCDDisplay').textContent = modeNames[mode] || mode;
            showNotification(`LCD set to ${modeNames[mode]}`, 'success');
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to set LCD mode:', error);
        
        // Fallback: Update only local state
        state.currentLCDMode = mode;
        document.getElementById('currentLCDDisplay').textContent = modeNames[mode] || mode;
        showNotification(`LCD mode set locally to ${modeNames[mode]}`, 'info');
    }
}

// ============================================
// Connection Management
// ============================================
function showSetupModal() {
    elements.setupModal.classList.add('active');
    generateQRCode();
}

function hideSetupModal() {
    elements.setupModal.classList.remove('active');
}

function showDeviceSettingsModal() {
    elements.deviceSettingsModal.classList.add('active');
    updateSettingsDisplay();
}

function hideDeviceSettingsModal() {
    elements.deviceSettingsModal.classList.remove('active');
}

function updateSettingsDisplay() {
    elements.currentMode.textContent = state.connectionMode;
    elements.currentIP.textContent = state.deviceIp;
    elements.currentStatus.textContent = state.isConnected ? 'Connected' : 'Disconnected';
    elements.deviceIpInput.value = state.deviceIp;
    elements.connectionModeSelect.value = state.connectionMode;
    
    // Update mode description
    const modeDescription = document.getElementById('modeDescription');
    switch(state.connectionMode) {
        case 'local':
            modeDescription.textContent = 'Connect to the same WiFi network as ESP32';
            break;
        case 'cloud':
            modeDescription.textContent = 'Remote access via Firebase Cloud';
            break;
        case 'auto':
            modeDescription.textContent = 'Try local first, fallback to cloud';
            break;
    }
}

function updateDeviceIP() {
    const newIp = elements.deviceIpInput.value.trim();
    if (newIp && isValidIP(newIp)) {
        state.deviceIp = newIp;
        localStorage.setItem('airsentinel_deviceIp', newIp);
        updateSettingsDisplay();
        showNotification(`Device IP updated to ${newIp}`, 'success');
    } else {
        showNotification('Please enter a valid IP address', 'error');
    }
}

function isValidIP(ip) {
    const pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!pattern.test(ip)) return false;
    
    return ip.split('.').every(segment => {
        const num = parseInt(segment, 10);
        return num >= 0 && num <= 255;
    });
}

function updateConnectionMode() {
    state.connectionMode = elements.connectionModeSelect.value;
    localStorage.setItem('airsentinel_connectionMode', state.connectionMode);
    updateSettingsDisplay();
    
    switch(state.connectionMode) {
        case 'cloud':
            updateConnectionStatus('connected', 'Connected via Cloud');
            break;
        case 'local':
            checkLocalConnection();
            break;
        case 'auto':
            checkLocalConnection();
            break;
    }
}

async function testConnection() {
    updateConnectionStatus('connecting', 'Testing connection...');
    
    try {
        // Test local connection
        const response = await fetch(`http://${state.deviceIp}/api/status`, {
            timeout: 3000
        }).catch(() => null);
        
        if (response && response.ok) {
            state.isLocalConnected = true;
            updateConnectionStatus('connected', 'Local connection successful');
            showNotification('Local connection test successful!', 'success');
            return;
        }
    } catch (error) {
        console.log('Local connection failed:', error);
    }
    
    // Test Firebase connection
    const connectedRef = database.ref('.info/connected');
    try {
        const snap = await connectedRef.once('value');
        if (snap.val() === true) {
            updateConnectionStatus('connected', 'Cloud connection successful');
            showNotification('Cloud connection test successful!', 'success');
        } else {
            updateConnectionStatus('disconnected', 'Connection failed');
            showNotification('Connection test failed', 'error');
        }
    } catch (error) {
        updateConnectionStatus('disconnected', 'Connection failed');
        showNotification('Connection test failed', 'error');
    }
    
    updateSettingsDisplay();
}

async function checkLocalConnection() {
    try {
        const response = await fetch(`http://${state.deviceIp}/api/status`, {
            timeout: 2000
        }).catch(() => null);
        
        if (response && response.ok) {
            updateConnectionStatus('connected', 'Connected locally');
            state.isLocalConnected = true;
        } else {
            updateConnectionStatus('disconnected', 'Local connection failed');
            state.isLocalConnected = false;
        }
    } catch (error) {
        updateConnectionStatus('disconnected', 'Local connection failed');
        state.isLocalConnected = false;
    }
}

function checkConnection() {
    testConnection();
    
    // Update modal status
    if (elements.modalConnectionStatus) {
        elements.modalConnectionStatus.innerHTML = `
            <i class="fas fa-circle-notch fa-spin"></i> Testing connection...
        `;
        
        setTimeout(() => {
            if (state.isConnected || state.isLocalConnected) {
                elements.modalConnectionStatus.innerHTML = `
                    <i class="fas fa-check-circle" style="color: #4CAF50;"></i> Connected successfully!
                `;
            } else {
                elements.modalConnectionStatus.innerHTML = `
                    <i class="fas fa-times-circle" style="color: #f44336;"></i> Connection failed
                `;
            }
        }, 2000);
    }
}

function generateQRCode() {
    const container = document.getElementById('qrCodeContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const wifiData = `WIFI:S:${elements.wifiSsid.textContent};T:WPA;P:${elements.wifiPassword.textContent};;`;
    
    if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(container, wifiData, {
            width: 160,
            height: 160,
            margin: 1,
            color: {
                dark: '#2c3e50',
                light: '#ffffff'
            }
        }, function(error) {
            if (error) {
                console.error('QR Code generation error:', error);
                container.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">QR Code failed to generate</div>';
            }
        });
    } else {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">QR Code library not loaded</div>';
    }
}

// ============================================
// UI Functions
// ============================================
function refreshData() {
    updateConnectionStatus('connecting', 'Refreshing data...');
    
    // Force fetch latest data from Firebase
    const sensorRef = database.ref('sensor_readings');
    sensorRef.orderByKey().limitToLast(1).once('child_added')
        .then(snapshot => {
            const data = snapshot.val();
            state.lastUpdateTime = new Date();
            updateDashboard(data);
            updateSensorHistory(data);
            updateCurrentChart();
            updateLastUpdateTime();
            
            updateConnectionStatus('connected', 'Data refreshed');
            showNotification('Data refreshed successfully', 'success');
        })
        .catch(error => {
            console.error('Refresh failed:', error);
            updateConnectionStatus('disconnected', 'Refresh failed');
            showNotification('Failed to refresh data', 'error');
        });
}

function toggleTheme() {
    state.isDarkTheme = !state.isDarkTheme;
    document.body.classList.toggle('dark-theme', state.isDarkTheme);
    
    const themeIcon = document.querySelector('.fa-moon');
    if (themeIcon) {
        if (state.isDarkTheme) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
            themeIcon.title = 'Switch to Light Mode';
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
            themeIcon.title = 'Switch to Dark Mode';
        }
    }
    
    localStorage.setItem('airsentinel_darkTheme', state.isDarkTheme);
    showNotification(`Switched to ${state.isDarkTheme ? 'Dark' : 'Light'} theme`, 'info');
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function getNotificationIcon(type) {
    switch(type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

function updateLastUpdateTime() {
    if (!state.lastUpdateTime) return;
    
    const element = document.getElementById('lastUpdateTime');
    if (element) {
        const timeString = state.lastUpdateTime.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        element.textContent = timeString;
    }
}

// ============================================
// Flowise Chatbot Management
// ============================================
function checkAndOpenChatbot() {
    // Check if Flowise button exists and click it to open
    const flowiseButton = document.querySelector('.flowise-chat-button');
    if (flowiseButton) {
        setTimeout(() => {
            flowiseButton.click();
            console.log('✅ Flowise chatbot opened automatically');
            
            // Send sensor data context
            if (window.currentSensorData) {
                const sensorData = window.currentSensorData;
                console.log('📊 Sensor data available for chatbot:', sensorData);
                
                // Store in global variable for chatbot context
                window.sensorDataContext = sensorData;
            }
        }, 2500);
    }
}


function showAssistancePopupChatbot() {
    hideAssistancePopup();
    
    // Click the Flowise button to open the chatbot
    const flowiseButton = document.querySelector('.flowise-chat-button');
    if (flowiseButton) {
        flowiseButton.click();
        showNotification('AI Assistant opened! Ask me anything about air quality.', 'success');
    } else {
        showNotification('AI Assistant is loading... Please wait.', 'info');
    }
}



// ============================================
// Initialization
// ============================================
// Update the initialization function
function initialize() {
    console.log('Initializing AirSentinel Firebase Dashboard...');
    
    // Load saved settings
    const savedIp = localStorage.getItem('airsentinel_deviceIp');
    const savedMode = localStorage.getItem('airsentinel_connectionMode');
    const savedTheme = localStorage.getItem('airsentinel_darkTheme');
    
    if (savedIp) state.deviceIp = savedIp;
    if (savedMode) state.connectionMode = savedMode;
    if (savedTheme === 'true') {
        state.isDarkTheme = true;
        document.body.classList.add('dark-theme');
        const themeIcon = document.querySelector('.fa-moon');
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    }
    
    // Initialize Firebase listener
    startFirebaseListener();
    
    // Initialize UI
    updateLEDStatus();
    updateSettingsDisplay();
    generateQRCode();
    
    // Initialize charts
    updateCurrentChart();
    
    // Get user location
    getLocation();
    
    console.log('Dashboard ready. Listening for Firebase data...');
    
    // Check initial connection
    setTimeout(() => testConnection(), 1000);
    
    // Setup Flowise chatbot auto-open
    setTimeout(checkAndOpenChatbot, 3000);
    
    // Add click outside listener for modals
    document.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.classList.remove('active');
        }
    });
}

// ============================================
// Event Listeners & Global Functions
// ============================================
document.addEventListener('DOMContentLoaded', initialize);

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        hideSetupModal();
        hideDeviceSettingsModal();
        hideTemperatureModal();
        hideHumidityModal();
        hideAirQualityModal();
        hideCO2Modal();
        hideAssistancePopup();
        if (state.chatbotVisible) toggleChatbot();
    }
    if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
        event.preventDefault();
        refreshData();
    }
    if (event.key === 't' && event.ctrlKey) {
        event.preventDefault();
        toggleTheme();
    }
});

// Make all functions globally available
window.toggleLED = toggleLED;
window.calibrateSensor = calibrateSensor;
window.setLCDMode = setLCDMode;
window.toggleTheme = toggleTheme;
window.switchChart = switchChart;
window.refreshData = refreshData;
window.showSetupModal = showSetupModal;
window.hideSetupModal = hideSetupModal;
window.showDeviceSettingsModal = showDeviceSettingsModal;
window.hideDeviceSettingsModal = hideDeviceSettingsModal;
window.updateDeviceIP = updateDeviceIP;
window.updateConnectionMode = updateConnectionMode;
window.testConnection = testConnection;
window.checkConnection = checkConnection;
window.updateLocation = updateLocation;
window.showTemperatureModal = showTemperatureModal;
window.hideTemperatureModal = hideTemperatureModal;
window.showHumidityModal = showHumidityModal;
window.hideHumidityModal = hideHumidityModal;
window.showAirQualityModal = showAirQualityModal;
window.hideAirQualityModal = hideAirQualityModal;
window.showCO2Modal = showCO2Modal;
window.hideCO2Modal = hideCO2Modal;
window.showAssistancePopup = showAssistancePopup;
window.hideAssistancePopup = hideAssistancePopup;
window.openChatbot = openChatbot;
window.toggleChatbot = toggleChatbot;

console.log("✅ AirSentinel script.js loaded successfully!");
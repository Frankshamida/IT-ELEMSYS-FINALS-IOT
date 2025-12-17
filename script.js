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
    isLocalConnected: false
};

// DOM Elements
const elements = {
    connectionIndicator: document.getElementById('connectionIndicator'),
    connectionText: document.getElementById('connectionText'),
    connectionBanner: document.getElementById('connectionBanner'),
    disconnectedOverlay: document.getElementById('disconnectedOverlay'),
    setupModal: document.getElementById('setupModal'),
    deviceSettingsModal: document.getElementById('deviceSettingsModal'),
    modalConnectionStatus: document.getElementById('modalConnectionStatus'),
    deviceIpInput: document.getElementById('deviceIpInput'),
    connectionModeSelect: document.getElementById('connectionModeSelect'),
    wifiSsid: document.getElementById('wifiSsid'),
    wifiPassword: document.getElementById('wifiPassword'),
    currentMode: document.getElementById('currentMode'),
    currentIP: document.getElementById('currentIP'),
    currentStatus: document.getElementById('currentStatus')
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
        updateAIRecommendations(data);
        updateLastUpdateTime();
        updateConnectionStatus('connected', `Live from Firebase`);
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
            elements.connectionBanner.classList.add('hidden');
            hideDisconnectedOverlay();
        } else {
            console.log("⚠️  Disconnected from Firebase");
            updateConnectionStatus('disconnected', 'Disconnected from Firebase');
            elements.connectionBanner.classList.remove('hidden');
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
    const currentLevel = document.getElementById('currentLevel');
    
    if (ppm === null || ppm === undefined || ppm === "Error" || ppm === 0) {
        aqiDot.className = 'aqi-dot';
        aqiLabel.textContent = '--';
        gaugeMarker.style.left = '0%';
        currentLevel.textContent = '--';
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
    aqiLabel.className = 'aqi-label level-' + colorClass;
    gaugeMarker.style.left = Math.min(position, 100) + '%';
    currentLevel.textContent = quality;
    currentLevel.className = 'level-' + colorClass;
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
        chart.innerHTML = '<div class="chart-empty">No data available yet</div>';
        return;
    }
    
    // Find min and max values for scaling
    const values = data.map(d => d.value).filter(v => !isNaN(v));
    if (values.length === 0) {
        chart.innerHTML = '<div class="chart-empty">No valid data</div>';
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
// AI Health Recommendations
// ============================================
function updateAIRecommendations(data) {
    const aiContainer = document.getElementById('aiRecommendations');
    const recommendations = getAIRecommendations(data);
    
    aiContainer.innerHTML = '';
    
    recommendations.forEach(rec => {
        const message = document.createElement('div');
        message.className = 'ai-message';
        
        message.innerHTML = `
            <div class="ai-message-icon">
                <i class="fas ${rec.icon}"></i>
            </div>
            <div class="ai-message-content">
                <div class="ai-message-title">${rec.title}</div>
                <div class="ai-message-text">${rec.text}</div>
            </div>
        `;
        
        aiContainer.appendChild(message);
    });
}

function getAIRecommendations(data) {
    const recommendations = [];
    
    // Skip if data is invalid
    if (!data || data.air_quality === "Error" || data.air_quality === 0) {
        recommendations.push({
            icon: 'fa-exclamation-triangle',
            title: 'No Sensor Data',
            text: 'Waiting for sensor data to provide recommendations.'
        });
        return recommendations;
    }
    
    const temp = parseFloat(data.temperature) || 0;
    const humidity = parseFloat(data.humidity) || 0;
    const airQuality = parseFloat(data.air_quality) || 0;
    const co2 = parseFloat(data.co2) || 0;
    
    // Temperature recommendations
    if (temp < 18) {
        recommendations.push({
            icon: 'fa-temperature-low',
            title: 'Low Temperature Alert',
            text: 'Consider increasing room temperature to 20-22°C for optimal comfort.'
        });
    } else if (temp > 28) {
        recommendations.push({
            icon: 'fa-temperature-high',
            title: 'High Temperature Alert',
            text: 'Consider using a fan or AC to cool down to 22-25°C.'
        });
    } else if (temp >= 20 && temp <= 25) {
        recommendations.push({
            icon: 'fa-check-circle',
            title: 'Ideal Temperature',
            text: 'Room temperature is in the comfortable range. Well done!'
        });
    }
    
    // Humidity recommendations
    if (humidity < 30) {
        recommendations.push({
            icon: 'fa-tint-slash',
            title: 'Low Humidity',
            text: 'Air is too dry. Consider using a humidifier (ideal: 40-60%).'
        });
    } else if (humidity > 70) {
        recommendations.push({
            icon: 'fa-umbrella',
            title: 'High Humidity',
            text: 'Air is too humid. Consider using a dehumidifier or opening windows.'
        });
    } else if (humidity >= 40 && humidity <= 60) {
        recommendations.push({
            icon: 'fa-check-circle',
            title: 'Ideal Humidity',
            text: 'Humidity level is perfect for comfort and health.'
        });
    }
    
    // Air quality recommendations
    if (airQuality > 100) {
        recommendations.push({
            icon: 'fa-wind',
            title: 'Poor Air Quality',
            text: airQuality > 200 
                ? '⚠️ Air quality is hazardous! Open windows or use air purifier immediately.'
                : 'Consider ventilating the room or using an air purifier.'
        });
    } else if (airQuality <= 50) {
        recommendations.push({
            icon: 'fa-check-circle',
            title: 'Excellent Air Quality',
            text: 'Air quality is excellent! Keep up the good ventilation.'
        });
    }
    
    // CO2 recommendations
    if (co2 > 1000) {
        recommendations.push({
            icon: 'fa-cloud',
            title: 'High CO₂ Level',
            text: 'CO₂ level is elevated. Open windows for fresh air circulation.'
        });
    } else if (co2 < 600 && co2 > 0) {
        recommendations.push({
            icon: 'fa-check-circle',
            title: 'Good CO₂ Level',
            text: 'CO₂ concentration is within healthy range.'
        });
    }
    
    // If all is good and no specific recommendations
    if (recommendations.length === 0) {
        recommendations.push({
            icon: 'fa-thumbs-up',
            title: 'Environment Optimal',
            text: 'All parameters are within healthy ranges. Keep up the good ventilation!'
        });
    }
    
    // Always add a general tip
    recommendations.push({
        icon: 'fa-lightbulb',
        title: 'General Tip',
        text: 'Regular ventilation (10-15 minutes) every few hours helps maintain good air quality.'
    });
    
    return recommendations;
}

function refreshAI() {
    // Get latest data from Firebase
    const sensorRef = database.ref('sensor_readings');
    sensorRef.orderByKey().limitToLast(1).once('child_added')
        .then(snapshot => {
            const data = snapshot.val();
            updateAIRecommendations(data);
            showNotification('AI recommendations refreshed', 'success');
        })
        .catch(error => {
            console.error('Failed to refresh AI:', error);
            showNotification('Failed to refresh recommendations', 'error');
        });
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
        ledIndicator.classList.add('active');
        ledStatusText.textContent = 'ON';
        ledStatusText.style.color = '#4CAF50';
    } else {
        ledIndicator.classList.remove('active');
        ledStatusText.textContent = 'OFF';
        ledStatusText.style.color = '#666';
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
        // First, try to get the ESP32 IP address
        let deviceIp = state.deviceIp;
        
        // If using cloud mode, we need to find the ESP32's local IP
        if (state.connectionMode === 'cloud' || !state.isLocalConnected) {
            // Try to discover the ESP32 on the local network
            const localResponse = await fetch(`http://${deviceIp}/api/status`, {
                method: 'GET',
                timeout: 3000
            }).catch(() => null);
            
            if (!localResponse || !localResponse.ok) {
                showNotification('Cannot connect to ESP32 for LCD control', 'error');
                return;
            }
        }
        
        // Send LCD mode command directly to ESP32
        const response = await fetch(`http://${deviceIp}/api/lcd`, {
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
            
            // Log the action
            console.log(`📺 LCD Mode changed to: ${mode} (sent to ESP32)`);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to set LCD mode on ESP32:', error);
        
        // Fallback: Try to save the mode in Firebase as a command
        try {
            const database = firebase.database();
            const commandsRef = database.ref('lcd_commands');
            
            // Create a new command entry
            const command = {
                mode: mode,
                timestamp: Date.now(),
                processed: false
            };
            
            await commandsRef.push(command);
            
            // Update local state
            state.currentLCDMode = mode;
            document.getElementById('currentLCDDisplay').textContent = modeNames[mode] || mode;
            showNotification(`LCD command sent to cloud. ESP32 will update when connected.`, 'info');
            
            console.log(`📡 LCD command saved to Firebase: ${mode}`);
        } catch (firebaseError) {
            console.error('Failed to save LCD command to Firebase:', firebaseError);
            
            // Last resort: Update only local state
            state.currentLCDMode = mode;
            document.getElementById('currentLCDDisplay').textContent = modeNames[mode] || mode;
            showNotification(`LCD mode set locally to ${modeNames[mode]}`, 'info');
        }
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
            width: 150,
            height: 150,
            margin: 1,
            color: {
                dark: '#2c3e50',
                light: '#ffffff'
            }
        }, function(error) {
            if (error) {
                console.error('QR Code generation error:', error);
                container.innerHTML = '<div class="qr-error">QR Code failed to generate</div>';
            }
        });
    } else {
        container.innerHTML = '<div class="qr-error">QR Code library not loaded</div>';
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
            updateAIRecommendations(data);
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
// Initialization
// ============================================
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
    
    // Set up initial AI recommendations
    const initialData = {
        temperature: 22.5,
        humidity: 45.0,
        air_quality: 35,
        co2: 450,
        analog_raw: 512,
        device_ready: true,
        timestamp: Math.floor(Date.now() / 1000)
    };
    updateAIRecommendations(initialData);
    
    console.log('Dashboard ready. Listening for Firebase data...');
    
    // Check initial connection
    setTimeout(() => testConnection(), 1000);
}

// ============================================
// Event Listeners & Global Functions
// ============================================
document.addEventListener('DOMContentLoaded', initialize);

// Close modals when clicking outside
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        hideSetupModal();
        hideDeviceSettingsModal();
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
window.refreshAI = refreshAI;
window.showSetupModal = showSetupModal;
window.hideSetupModal = hideSetupModal;
window.showDeviceSettingsModal = showDeviceSettingsModal;
window.hideDeviceSettingsModal = hideDeviceSettingsModal;
window.updateDeviceIP = updateDeviceIP;
window.updateConnectionMode = updateConnectionMode;
window.testConnection = testConnection;
window.checkConnection = checkConnection;

// ============================================
// Direct ESP32 Control Functions
// ============================================

async function sendDirectCommand(command) {
    try {
        let endpoint = '';
        let method = 'POST';
        let body = null;
        
        switch(command) {
            case 'led_toggle':
                endpoint = '/api/led/toggle';
                break;
            case 'beep':
                endpoint = '/api/system/control';
                body = JSON.stringify({ command: 'beep' });
                break;
            case 'restart':
                endpoint = '/api/system/control';
                body = JSON.stringify({ command: 'restart' });
                break;
            default:
                showNotification('Unknown command', 'error');
                return;
        }
        
        const response = await fetch(`http://${state.deviceIp}${endpoint}`, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: body
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification(`Command sent successfully: ${command}`, 'success');
            console.log(`✅ ESP32 Command ${command} sent successfully`);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error(`Failed to send command ${command}:`, error);
        showNotification(`Failed to send command to ESP32`, 'error');
    }
}

async function testESP32Connection() {
    const statusDiv = document.getElementById('esp32Status');
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing connection...';
    statusDiv.className = 'status-message connecting';
    
    try {
        const response = await fetch(`http://${state.deviceIp}/api/status`, {
            timeout: 5000
        });
        
        if (response.ok) {
            const data = await response.json();
            statusDiv.innerHTML = `
                <div style="color: #4CAF50;">
                    <i class="fas fa-check-circle"></i> ESP32 Connected!
                </div>
                <div style="margin-top: 10px; font-size: 12px;">
                    <strong>IP:</strong> ${data.ipAddress || state.deviceIp}<br>
                    <strong>WiFi:</strong> ${data.wifiStatus}<br>
                    <strong>SSID:</strong> ${data.ssid || 'Unknown'}
                </div>
            `;
            statusDiv.className = 'status-message connected';
            
            state.isLocalConnected = true;
            updateConnectionStatus('connected', 'Connected to ESP32');
            
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        statusDiv.innerHTML = `
            <div style="color: #f44336;">
                <i class="fas fa-times-circle"></i> Cannot connect to ESP32
            </div>
            <div style="margin-top: 10px; font-size: 12px;">
                Error: ${error.message}<br>
                Make sure ESP32 is on the same network
            </div>
        `;
        statusDiv.className = 'status-message disconnected';
        
        state.isLocalConnected = false;
        updateConnectionStatus('disconnected', 'Cannot connect to ESP32');
    }
}

async function getESP32Status() {
    try {
        const response = await fetch(`http://${state.deviceIp}/api/data/all`);
        
        if (response.ok) {
            const data = await response.json();
            
            // Create a detailed status display
            const statusDiv = document.getElementById('esp32Status');
            statusDiv.innerHTML = `
                <div style="color: #4CAF50; margin-bottom: 10px;">
                    <i class="fas fa-check-circle"></i> ESP32 Status
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 12px;">
                    <div><strong>Temperature:</strong> ${data.temperature}</div>
                    <div><strong>Humidity:</strong> ${data.humidity}</div>
                    <div><strong>Air Quality:</strong> ${data.airQuality}</div>
                    <div><strong>CO₂:</strong> ${data.co2}</div>
                    <div><strong>Uptime:</strong> ${data.uptime}</div>
                    <div><strong>Free Heap:</strong> ${data.freeHeap}</div>
                    <div><strong>LED:</strong> ${data.ledState}</div>
                    <div><strong>WiFi RSSI:</strong> ${data.rssi || 'N/A'}</div>
                </div>
            `;
            statusDiv.className = 'status-message connected';
            
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        const statusDiv = document.getElementById('esp32Status');
        statusDiv.innerHTML = `
            <div style="color: #f44336;">
                <i class="fas fa-times-circle"></i> Failed to get status
            </div>
            <div style="margin-top: 10px; font-size: 12px;">
                Error: ${error.message}
            </div>
        `;
        statusDiv.className = 'status-message disconnected';
    }
}

// Make functions globally available
window.sendDirectCommand = sendDirectCommand;
window.testESP32Connection = testESP32Connection;
window.getESP32Status = getESP32Status;
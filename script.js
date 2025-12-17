// Configuration
const ESP32_BASE_URL = 'http://192.168.4.1';
const API_ENDPOINTS = {
    status: '/api/status',
    toggleLED: '/api/led/toggle',
    refresh: '/api/refresh',
    calibrate: '/api/calibrate',
    lcd: '/api/lcd',
    info: '/api/info'
};

// Global State
let state = {
    isConnected: false,
    ledState: false,
    currentLCDMode: 'welcome',
    currentChart: 'temperature',
    temperatureHistory: [],
    humidityHistory: [],
    airQualityHistory: [],
    maxHistoryPoints: 8,
    connectionRetries: 0,
    maxRetries: 3,
    updateInterval: null,
    lastUpdateTime: null,
    deviceInfo: {
        ssid: 'AirSentinel',
        password: '1234567890',
        ip: '192.168.4.1'
    }
};

// DOM Elements
const elements = {
    connectionIndicator: document.getElementById('connectionIndicator'),
    connectionText: document.getElementById('connectionText'),
    connectionBanner: document.getElementById('connectionBanner'),
    disconnectedOverlay: document.getElementById('disconnectedOverlay'),
    setupModal: document.getElementById('setupModal'),
    modalConnectionStatus: document.getElementById('modalConnectionStatus'),
    wifiSsid: document.getElementById('wifiSsid'),
    wifiPassword: document.getElementById('wifiPassword'),
    qrCodeContainer: document.getElementById('qrCodeContainer')
};

// Initialize QR Code
function initQRCode() {
    if (typeof QRCode !== 'undefined' && elements.qrCodeContainer) {
        const wifiString = `WIFI:S:${state.deviceInfo.ssid};T:WPA;P:${state.deviceInfo.password};;`;
        QRCode.toCanvas(elements.qrCodeContainer, wifiString, {
            width: 200,
            height: 200,
            colorDark: "#ffffff",
            colorLight: "transparent",
            margin: 1
        }, function(error) {
            if (error) console.error('QR Code error:', error);
        });
    }
}

// Show/Hide Modals
function showSetupModal() {
    elements.setupModal.classList.add('active');
    elements.wifiSsid.textContent = state.deviceInfo.ssid;
    elements.wifiPassword.textContent = state.deviceInfo.password;
    initQRCode();
}

function hideSetupModal() {
    elements.setupModal.classList.remove('active');
}

function showDisconnectedOverlay() {
    elements.disconnectedOverlay.classList.add('active');
}

function hideDisconnectedOverlay() {
    elements.disconnectedOverlay.classList.remove('active');
}

// Connection Management
async function checkConnection() {
    try {
        updateConnectionStatus('connecting', 'Checking connection...');
        
        const response = await fetch(`${ESP32_BASE_URL}${API_ENDPOINTS.status}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
            const data = await response.json();
            state.isConnected = true;
            state.connectionRetries = 0;
            
            updateConnectionStatus('connected', 'Connected to AirSentinel');
            elements.connectionBanner.classList.add('hidden');
            hideDisconnectedOverlay();
            hideSetupModal();
            
            return data;
        } else {
            throw new Error('Failed to fetch status');
        }
    } catch (error) {
        console.warn('Connection check failed:', error);
        state.connectionRetries++;
        
        if (state.connectionRetries >= state.maxRetries) {
            state.isConnected = false;
            updateConnectionStatus('disconnected', 'Disconnected - Connect to AirSentinel WiFi');
            elements.connectionBanner.classList.remove('hidden');
            showDisconnectedOverlay();
        } else {
            updateConnectionStatus('connecting', 'Retrying connection...');
        }
        
        return null;
    }
}

function updateConnectionStatus(status, text) {
    const indicatorDot = elements.connectionIndicator.querySelector('.indicator-dot');
    elements.connectionText.textContent = text;
    
    indicatorDot.classList.remove('connected');
    if (status === 'connected') {
        indicatorDot.classList.add('connected');
    }
    
    if (elements.modalConnectionStatus) {
        if (status === 'connected') {
            elements.modalConnectionStatus.innerHTML = '<i class="fas fa-check-circle"></i> Connected to AirSentinel!';
            elements.modalConnectionStatus.style.color = '#2ecc71';
        } else if (status === 'connecting') {
            elements.modalConnectionStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Searching for device...';
            elements.modalConnectionStatus.style.color = '#f39c12';
        } else {
            elements.modalConnectionStatus.innerHTML = '<i class="fas fa-times-circle"></i> Device not found';
            elements.modalConnectionStatus.style.color = '#e74c3c';
        }
    }
}

// Fetch Sensor Data
async function fetchSensorData() {
    if (!state.isConnected) {
        await checkConnection();
        if (!state.isConnected) return null;
    }
    
    try {
        const response = await fetch(`${ESP32_BASE_URL}${API_ENDPOINTS.status}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
            const data = await response.json();
            updateDashboard(data);
            updateSensorHistory(data);
            updateCurrentChart();
            updateAIRecommendations(data);
            
            state.lastUpdateTime = new Date();
            updateLastUpdateTime();
            
            return data;
        }
    } catch (error) {
        console.error('Failed to fetch sensor data:', error);
        state.isConnected = false;
        updateConnectionStatus('disconnected', 'Connection lost');
        return null;
    }
}

// Update Dashboard
function updateDashboard(data) {
    // Update main values
    updateElement('temperature', data.temperature, '°C');
    updateElement('humidity', data.humidity, '%');
    updateElement('airQuality', data.airQuality, 'PPM');
    updateElement('co2Level', data.co2Estimate, 'PPM');
    
    // Update times
    updateElement('tempTime', data.readingTime);
    updateElement('humTime', data.readingTime);
    updateElement('co2Time', data.readingTime);
    
    // Update air quality indicator
    updateAirQualityIndicator(data.airQuality);
    
    // Update system status
    updateElement('uptime', data.uptime);
    updateElement('freeHeap', data.freeHeap);
    updateElement('connectedClients', data.connectedClients);
    updateElement('analogRaw', data.analogRaw);
    updateElement('deviceReady', data.deviceReady ? 'Yes' : 'No');
    updateElement('sensorStatus', data.sensorStatus);
    updateElement('deviceIP', data.ipAddress);
    
    // Update LED status
    state.ledState = data.ledState === 'ON';
    updateLEDStatus();
}

function updateElement(id, value, suffix = '') {
    const element = document.getElementById(id);
    if (element) {
        if (value === undefined || value === null) {
            element.textContent = '--';
        } else {
            element.textContent = value + suffix;
        }
    }
}

// Update Air Quality Indicator
function updateAirQualityIndicator(ppm) {
    const aqiDot = document.getElementById('aqiDot');
    const aqiLabel = document.getElementById('aqiLabel');
    const gaugeMarker = document.getElementById('gaugeMarker');
    const currentLevel = document.getElementById('currentLevel');
    
    if (ppm === "Error" || ppm === "Hardware Error" || ppm === "Warming up") {
        aqiDot.className = 'aqi-dot';
        aqiLabel.textContent = ppm;
        gaugeMarker.style.left = '0%';
        currentLevel.textContent = ppm;
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

// Update LED Status
function updateLEDStatus() {
    const indicator = document.getElementById('ledIndicator');
    const statusText = document.getElementById('ledStatusText');
    
    if (state.ledState) {
        indicator.className = 'led-indicator on';
        statusText.textContent = 'ON';
    } else {
        indicator.className = 'led-indicator';
        statusText.textContent = 'OFF';
    }
}

// Device Control Functions
async function toggleLED() {
    try {
        const response = await fetch(`${ESP32_BASE_URL}${API_ENDPOINTS.toggleLED}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            state.ledState = data.ledState === 'ON';
            updateLEDStatus();
        }
    } catch (error) {
        console.error('Failed to toggle LED:', error);
        checkConnection();
    }
}

async function calibrateSensor() {
    if (!confirm('Calibration takes 30 seconds. The sensor should be in clean air. Continue?')) {
        return;
    }
    
    try {
        const calibrateBtn = document.querySelector('.btn-warning');
        const originalText = calibrateBtn.innerHTML;
        calibrateBtn.innerHTML = '<i class="fas fa-cog fa-spin"></i> Calibrating...';
        calibrateBtn.disabled = true;
        
        const response = await fetch(`${ESP32_BASE_URL}${API_ENDPOINTS.calibrate}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(`Calibration started: ${data.message}\nNew baseline: ${data.baseline}`);
        }
        
        setTimeout(() => {
            calibrateBtn.innerHTML = originalText;
            calibrateBtn.disabled = false;
        }, 1000);
        
    } catch (error) {
        console.error('Failed to calibrate:', error);
        alert('Calibration failed. Please check connection.');
    }
}

async function setLCDMode(mode) {
    try {
        const response = await fetch(`${ESP32_BASE_URL}${API_ENDPOINTS.lcd}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode: mode })
        });
        
        if (response.ok) {
            const data = await response.json();
            state.currentLCDMode = mode;
            
            const displayText = document.getElementById('currentLCDDisplay');
            const modeNames = {
                'welcome': 'Welcome Screen',
                'temperature': 'Temperature',
                'humidity': 'Humidity',
                'airquality': 'Air Quality',
                'co2': 'CO₂ Level',
                'alldata': 'All Data'
            };
            
            displayText.textContent = modeNames[mode] || mode;
        }
    } catch (error) {
        console.error('Failed to update LCD:', error);
        checkConnection();
    }
}

// Refresh Functions
async function refreshData() {
    const data = await fetchSensorData();
    if (data) {
        showNotification('Data refreshed successfully', 'success');
    }
}

function refreshAI() {
    // This would normally refresh AI recommendations
    showNotification('AI recommendations refreshed', 'info');
}

// Sensor History and Charts
function updateSensorHistory(data) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Temperature
    if (data.temperature !== "Error") {
        const temp = parseFloat(data.temperature);
        if (!isNaN(temp)) {
            state.temperatureHistory.push({ value: temp, time: timeString });
            if (state.temperatureHistory.length > state.maxHistoryPoints) {
                state.temperatureHistory.shift();
            }
        }
    }
    
    // Humidity
    if (data.humidity !== "Error") {
        const hum = parseFloat(data.humidity);
        if (!isNaN(hum)) {
            state.humidityHistory.push({ value: hum, time: timeString });
            if (state.humidityHistory.length > state.maxHistoryPoints) {
                state.humidityHistory.shift();
            }
        }
    }
    
    // Air Quality
    if (data.airQuality !== "Error" && data.airQuality !== "Warming up" && data.airQuality !== "Hardware Error") {
        const air = parseFloat(data.airQuality);
        if (!isNaN(air)) {
            state.airQualityHistory.push({ value: air, time: timeString });
            if (state.airQualityHistory.length > state.maxHistoryPoints) {
                state.airQualityHistory.shift();
            }
        }
    }
}

function switchChart(chartType) {
    state.currentChart = chartType;
    
    // Hide all charts
    document.getElementById('temperatureChart').style.display = 'none';
    document.getElementById('humidityChart').style.display = 'none';
    document.getElementById('airqualityChart').style.display = 'none';
    
    // Show selected chart
    document.getElementById(chartType + 'Chart').style.display = 'block';
    
    // Update active tab
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update the chart
    updateCurrentChart();
}

function updateCurrentChart() {
    let chartId, data, type;
    
    switch(state.currentChart) {
        case 'temperature':
            chartId = 'temperatureBars';
            data = state.temperatureHistory;
            type = 'temp';
            break;
        case 'humidity':
            chartId = 'humidityBars';
            data = state.humidityHistory;
            type = 'hum';
            break;
        case 'airquality':
            chartId = 'airqualityBars';
            data = state.airQualityHistory;
            type = 'air';
            break;
    }
    
    updateChart(chartId, data, type);
}

function updateChart(chartId, data, type) {
    const chart = document.getElementById(chartId);
    if (!chart) return;
    
    chart.innerHTML = '';
    
    if (data.length === 0) {
        chart.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding-top: 60px;">No data yet</div>';
        return;
    }
    
    // Find min and max values
    const values = data.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = Math.max(maxVal - minVal, 1);
    
    data.forEach((reading, index) => {
        const container = document.createElement('div');
        container.className = 'chart-bar-container';
        
        // Calculate bar height
        const normalizedValue = ((reading.value - minVal) / range) * 0.8 + 0.1;
        const barHeight = Math.max(normalizedValue * 100, 10);
        
        const bar = document.createElement('div');
        bar.className = `chart-bar ${type}`;
        bar.style.height = `${barHeight}%`;
        
        const valueLabel = document.createElement('div');
        valueLabel.className = 'bar-value';
        valueLabel.textContent = reading.value.toFixed(type === 'air' ? 0 : 1);
        
        const timeLabel = document.createElement('div');
        timeLabel.className = 'bar-time';
        timeLabel.textContent = reading.time;
        
        container.appendChild(valueLabel);
        container.appendChild(bar);
        container.appendChild(timeLabel);
        chart.appendChild(container);
    });
}

// AI Recommendations
function updateAIRecommendations(data) {
    const recommendations = getAIRecommendations(data);
    const container = document.getElementById('aiRecommendations');
    
    if (!container) return;
    
    container.innerHTML = '';
    
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
        container.appendChild(message);
    });
}

function getAIRecommendations(data) {
    const recommendations = [];
    
    // Temperature recommendations
    if (data.temperature !== "Error") {
        const temp = parseFloat(data.temperature);
        if (!isNaN(temp)) {
            if (temp < 18) {
                recommendations.push({
                    icon: 'fa-snowflake',
                    title: 'Too Cold',
                    text: 'Temperature is low. Consider using a heater to maintain comfort and prevent respiratory issues.'
                });
            } else if (temp >= 18 && temp <= 25) {
                recommendations.push({
                    icon: 'fa-check-circle',
                    title: 'Perfect Temperature',
                    text: 'Room temperature is ideal for comfort and health. Maintain this range.'
                });
            } else if (temp > 25 && temp <= 30) {
                recommendations.push({
                    icon: 'fa-thermometer-half',
                    title: 'Warm Environment',
                    text: 'Room is getting warm. Open windows for ventilation or use a fan.'
                });
            } else if (temp > 30) {
                recommendations.push({
                    icon: 'fa-fire',
                    title: 'Heat Risk Alert',
                    text: 'High temperature! Risk of heat stroke. Turn on AC, drink water, and avoid physical exertion.'
                });
            }
        }
    }
    
    // Humidity recommendations
    if (data.humidity !== "Error") {
        const hum = parseFloat(data.humidity);
        if (!isNaN(hum)) {
            if (hum < 30) {
                recommendations.push({
                    icon: 'fa-tint-slash',
                    title: 'Low Humidity',
                    text: 'Air is too dry. Use a humidifier to prevent dry skin and respiratory irritation.'
                });
            } else if (hum >= 30 && hum <= 60) {
                recommendations.push({
                    icon: 'fa-tint',
                    title: 'Ideal Humidity',
                    text: 'Humidity level is perfect for health and comfort.'
                });
            } else if (hum > 60 && hum <= 70) {
                recommendations.push({
                    icon: 'fa-exclamation-triangle',
                    title: 'High Humidity',
                    text: 'Humidity is high. Risk of mold growth. Improve ventilation or use a dehumidifier.'
                });
            } else if (hum > 70) {
                recommendations.push({
                    icon: 'fa-biohazard',
                    title: 'Mold Alert',
                    text: 'Very high humidity! Mold risk extreme. Use dehumidifier immediately and ventilate.'
                });
            }
        }
    }
    
    // Air Quality recommendations
    if (data.airQuality !== "Error" && data.airQuality !== "Warming up" && data.airQuality !== "Hardware Error") {
        const air = parseFloat(data.airQuality);
        if (!isNaN(air)) {
            if (air <= 50) {
                recommendations.push({
                    icon: 'fa-leaf',
                    title: 'Excellent Air',
                    text: 'Air quality is excellent. Perfect for indoor activities.'
                });
            } else if (air > 50 && air <= 100) {
                recommendations.push({
                    icon: 'fa-window-maximize',
                    title: 'Moderate Air',
                    text: 'Air quality is moderate. Open windows for fresh air circulation.'
                });
            } else if (air > 100 && air <= 200) {
                recommendations.push({
                    icon: 'fa-head-side-mask',
                    title: 'Poor Air Quality',
                    text: 'Air is unhealthy. Sensitive individuals should avoid prolonged exposure. Use air purifier.'
                });
            } else if (air > 200) {
                recommendations.push({
                    icon: 'fa-exclamation-circle',
                    title: 'Hazardous Air',
                    text: 'DANGER! Air quality is hazardous. Evacuate or use heavy-duty air purifier immediately.'
                });
            }
        }
    }
    
    // If no specific recommendations, add general tips
    if (recommendations.length === 0) {
        recommendations.push({
            icon: 'fa-lightbulb',
            title: 'General Health Tip',
            text: 'Maintain room temperature 20-25°C and humidity 40-60% for optimal comfort and health.'
        });
    }
    
    return recommendations.slice(0, 3);
}

// UI Helpers
function updateLastUpdateTime() {
    const element = document.getElementById('lastUpdateTime');
    if (element && state.lastUpdateTime) {
        element.textContent = state.lastUpdateTime.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add styles if not already added
    if (!document.querySelector('.notification')) {
        const style = document.createElement('style');
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--card-bg);
                backdrop-filter: blur(10px);
                border: 1px solid var(--card-border);
                border-radius: 8px;
                padding: 15px 20px;
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 1000;
                animation: slideInRight 0.3s ease;
                max-width: 300px;
            }
            .notification-success {
                border-left: 4px solid var(--success-green);
            }
            .notification-info {
                border-left: 4px solid var(--accent-teal);
            }
            .notification button {
                background: none;
                border: none;
                color: var(--text-secondary);
                cursor: pointer;
                margin-left: auto;
            }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const themeBtn = document.querySelector('[title="Toggle Theme"] i');
    if (document.body.classList.contains('dark-mode')) {
        themeBtn.className = 'fas fa-sun';
        showNotification('Dark mode enabled', 'info');
    } else {
        themeBtn.className = 'fas fa-moon';
        showNotification('Light mode enabled', 'info');
    }
}

// Initialize everything
async function initialize() {
    console.log('Initializing AirSentinel Dashboard...');
    
    // Show setup modal on first load
    setTimeout(showSetupModal, 1000);
    
    // Start periodic updates
    state.updateInterval = setInterval(fetchSensorData, 3000);
    
    // Initial connection check
    await checkConnection();
    
    // Initial data fetch if connected
    if (state.isConnected) {
        await fetchSensorData();
    }
    
    // Add event listeners for buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn') && !e.target.closest('.modal')) {
            e.preventDefault();
        }
    });
    
    // Prevent pull-to-refresh
    let lastTouchY = 0;
    document.addEventListener('touchstart', (e) => {
        lastTouchY = e.touches[0].clientY;
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].clientY;
        const touchDelta = touchY - lastTouchY;
        
        if (touchDelta > 0 && window.scrollY === 0) {
            e.preventDefault();
        }
        
        lastTouchY = touchY;
    }, { passive: false });
    
    // Service Worker for PWA (optional)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
    
    // Add install prompt for PWA
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install button
        const installBtn = document.createElement('button');
        installBtn.className = 'btn btn-success';
        installBtn.innerHTML = '<i class="fas fa-download"></i> Install App';
        installBtn.onclick = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User ${outcome} the install prompt`);
                deferredPrompt = null;
                installBtn.remove();
            }
        };
        
        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            headerActions.prepend(installBtn);
        }
    });
    
    console.log('AirSentinel Dashboard initialized');
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);

// Make functions available globally
window.checkConnection = checkConnection;
window.toggleLED = toggleLED;
window.calibrateSensor = calibrateSensor;
window.setLCDMode = setLCDMode;
window.refreshData = refreshData;
window.refreshAI = refreshAI;
window.switchChart = switchChart;
window.showSetupModal = showSetupModal;
window.hideSetupModal = hideSetupModal;
window.toggleTheme = toggleTheme;
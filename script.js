// Global variables
let ledState = false;
let temperatureHistory = [];
let humidityHistory = [];
let airQualityHistory = [];
const maxHistoryPoints = 8;
let currentChart = 'temperature';
let chartInitialized = false;
let currentLCDMode = 'welcome';
let isConnected = true;
let lastConnectionCheck = 0;
const connectionCheckInterval = 5000; // Check every 5 seconds

// Connection monitoring
function checkConnection() {
    const overlay = document.getElementById('connectionOverlay');
    
    fetch('/status')
        .then(response => {
            if (!response.ok) throw new Error('Connection failed');
            return response.json();
        })
        .then(data => {
            // We got a response, we're connected
            isConnected = true;
            overlay.classList.add('hidden');
            lastConnectionCheck = Date.now();
        })
        .catch(error => {
            // No response, we're disconnected
            isConnected = false;
            overlay.classList.remove('hidden');
        });
}

// Send LCD command
async function sendLCDCommand(command) {
    try {
        const response = await fetch('/lcd/' + command);
        const data = await response.text();
        
        // Update display text
        const displayText = document.getElementById('currentLCDDisplay');
        const commandMap = {
            'welcome': 'Welcome Screen',
            'temperature': 'Temperature',
            'humidity': 'Humidity',
            'airquality': 'Air Quality',
            'co2': 'CO₂ Level',
            'alldata': 'All Data'
        };
        
        displayText.textContent = commandMap[command] || 'Unknown';
        currentLCDMode = command;
        
    } catch (error) {
        console.error('Error sending LCD command:', error);
        alert('Failed to update LCD display');
        checkConnection(); // Check if we're still connected
    }
}

// AI Recommendations based on sensor data
function getAIRecommendations(temp, hum, air, co2) {
    const recommendations = [];
    
    // Temperature recommendations
    if (temp !== "Error") {
        const tempValue = parseFloat(temp);
        if (!isNaN(tempValue)) {
            if (tempValue < 18) {
                recommendations.push({
                    icon: "❄️",
                    title: "Too Cold",
                    text: "Temperature is low. Consider using a heater to maintain comfort and prevent respiratory issues."
                });
            } else if (tempValue >= 18 && tempValue <= 25) {
                recommendations.push({
                    icon: "✅",
                    title: "Perfect Temperature",
                    text: "Room temperature is ideal for comfort and health. Maintain this range."
                });
            } else if (tempValue > 25 && tempValue <= 30) {
                recommendations.push({
                    icon: "🌡️",
                    title: "Warm Environment",
                    text: "Room is getting warm. Open windows for ventilation or use a fan."
                });
            } else if (tempValue > 30) {
                recommendations.push({
                    icon: "🔥",
                    title: "Heat Risk Alert",
                    text: "High temperature! Risk of heat stroke. Turn on AC, drink water, and avoid physical exertion."
                });
            }
        }
    }
    
    // Humidity recommendations
    if (hum !== "Error") {
        const humValue = parseFloat(hum);
        if (!isNaN(humValue)) {
            if (humValue < 30) {
                recommendations.push({
                    icon: "🏜️",
                    title: "Low Humidity",
                    text: "Air is too dry. Use a humidifier to prevent dry skin and respiratory irritation."
                });
            } else if (humValue >= 30 && humValue <= 60) {
                recommendations.push({
                    icon: "💧",
                    title: "Ideal Humidity",
                    text: "Humidity level is perfect for health and comfort."
                });
            } else if (humValue > 60 && humValue <= 70) {
                recommendations.push({
                    icon: "⚠️",
                    title: "High Humidity",
                    text: "Humidity is high. Risk of mold growth. Improve ventilation or use a dehumidifier."
                });
            } else if (humValue > 70) {
                recommendations.push({
                    icon: "🦠",
                    title: "Mold Alert",
                    text: "Very high humidity! Mold risk extreme. Use dehumidifier immediately and ventilate."
                });
            }
        }
    }
    
    // Air Quality recommendations
    if (air !== "Error" && air !== "Warming up" && air !== "Hardware Error") {
        const airValue = parseFloat(air);
        if (!isNaN(airValue)) {
            if (airValue <= 50) {
                recommendations.push({
                    icon: "🌿",
                    title: "Excellent Air",
                    text: "Air quality is excellent. Perfect for indoor activities."
                });
            } else if (airValue > 50 && airValue <= 100) {
                recommendations.push({
                    icon: "🪟",
                    title: "Moderate Air",
                    text: "Air quality is moderate. Open windows for fresh air circulation."
                });
            } else if (airValue > 100 && airValue <= 200) {
                recommendations.push({
                    icon: "😷",
                    title: "Poor Air Quality",
                    text: "Air is unhealthy. Sensitive individuals should avoid prolonged exposure. Use air purifier."
                });
            } else if (airValue > 200) {
                recommendations.push({
                    icon: "🚨",
                    title: "Hazardous Air",
                    text: "DANGER! Air quality is hazardous. Evacuate or use heavy-duty air purifier immediately."
                });
            }
        }
    }
    
    // CO2 recommendations
    if (co2 !== "Check Wiring" && co2 !== "Error") {
        const co2Str = co2.toString();
        if (!co2Str.includes('s')) { // Not warming up
            const co2Value = parseFloat(co2);
            if (!isNaN(co2Value)) {
                if (co2Value > 1000) {
                    recommendations.push({
                        icon: "💨",
                        title: "High CO₂ Levels",
                        text: "CO₂ levels elevated. Ventilate room immediately to prevent drowsiness and headaches."
                    });
                }
            }
        }
    }
    
    // General health tips
    if (recommendations.length === 0) {
        recommendations.push({
            icon: "💡",
            title: "General Health Tip",
            text: "Maintain room temperature 20-25°C and humidity 40-60% for optimal comfort and health."
        });
    }
    
    // Add ventilation reminder if temperature and humidity are moderate
    const tempNum = parseFloat(temp);
    const humNum = parseFloat(hum);
    if (!isNaN(tempNum) && !isNaN(humNum)) {
        if (tempNum >= 20 && tempNum <= 26 && humNum >= 40 && humNum <= 60) {
            recommendations.push({
                icon: "🌬️",
                title: "Ventilation Reminder",
                text: "Perfect conditions! Open windows for 15 minutes to refresh indoor air."
            });
        }
    }
    
    return recommendations.slice(0, 4); // Return max 4 recommendations
}

// Display AI recommendations
function displayAIRecommendations(temp, hum, air, co2) {
    const recommendations = getAIRecommendations(temp, hum, air, co2);
    const container = document.getElementById('aiRecommendations');
    container.innerHTML = '';
    
    recommendations.forEach(rec => {
        const message = document.createElement('div');
        message.className = 'ai-message';
        message.innerHTML = `
            <div class="ai-message-icon">${rec.icon}</div>
            <div class="ai-message-content">
                <div class="ai-message-title">${rec.title}</div>
                <div class="ai-message-text">${rec.text}</div>
            </div>
        `;
        container.appendChild(message);
    });
}

// Initialize charts
function initCharts() {
    if (chartInitialized) return;
    
    // Create grid lines for all charts
    for (let i = 0; i <= 10; i++) {
        ['tempGrid', 'humGrid', 'airGrid'].forEach(gridId => {
            const grid = document.getElementById(gridId);
            if (grid) {
                const gridLine = document.createElement('div');
                gridLine.className = 'grid-line';
                grid.appendChild(gridLine);
            }
        });
    }
    
    chartInitialized = true;
}

// Switch between charts
function switchChart(chartType) {
    currentChart = chartType;
    
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

// Update current chart
function updateCurrentChart() {
    switch(currentChart) {
        case 'temperature':
            updateChart('temperatureBars', temperatureHistory, 'temp');
            break;
        case 'humidity':
            updateChart('humidityBars', humidityHistory, 'hum');
            break;
        case 'airquality':
            updateChart('airqualityBars', airQualityHistory, 'air');
            break;
    }
}

// Toggle LED
async function toggleLED() {
    try {
        const response = await fetch('/led/toggle');
        const data = await response.text();
        ledState = data === 'ON';
        updateLEDStatus();
    } catch (error) {
        console.error('Error toggling LED:', error);
        checkConnection();
    }
}

// Update LED status
function updateLEDStatus() {
    const indicator = document.getElementById('ledIndicator');
    const statusText = document.getElementById('ledStatusText');
    
    if (ledState) {
        indicator.className = 'led-indicator on';
        statusText.textContent = 'ON';
    } else {
        indicator.className = 'led-indicator';
        statusText.textContent = 'OFF';
    }
}

// Refresh sensors
async function refreshSensors() {
    try {
        const response = await fetch('/refresh');
        await response.json();
        updateSystemInfo();
    } catch (error) {
        console.error('Error refreshing sensors:', error);
        checkConnection();
    }
}

// Calibrate MQ-135
async function calibrateMQ135() {
    try {
        // Show calibration progress
        const calibrateBtn = document.querySelector('.btn-warning');
        const originalText = calibrateBtn.innerHTML;
        calibrateBtn.innerHTML = '<span>⏳</span> Calibrating...';
        calibrateBtn.disabled = true;
        
        // Start calibration
        const response = await fetch('/calibrate');
        const data = await response.json();
        
        // Reset button after calibration
        setTimeout(() => {
            calibrateBtn.innerHTML = originalText;
            calibrateBtn.disabled = false;
        }, 1000);
        
        if (data.error) {
            alert('Calibration failed: ' + data.error);
        } else {
            alert('Calibration complete! New baseline: ' + data.baseline);
        }
    } catch (error) {
        console.error('Error calibrating sensor:', error);
        alert('Calibration failed. Please try again.');
        checkConnection();
        
        // Reset button on error
        const calibrateBtn = document.querySelector('.btn-warning');
        calibrateBtn.innerHTML = '<span>⚙️</span> Calibrate (30s)';
        calibrateBtn.disabled = false;
    }
}

// Update air quality indicator
function updateAirQualityIndicator(ppm) {
    const aqiDot = document.getElementById('aqiDot');
    const aqiLabel = document.getElementById('aqiLabel');
    const gaugeMarker = document.getElementById('gaugeMarker');
    const currentLevel = document.getElementById('currentLevel');
    
    let quality = 'Good';
    let colorClass = 'good';
    let position = 12.5; // Default position (0-100%)
    
    if (ppm === "Warming up" || ppm === "Error" || ppm === "Hardware Error") {
        quality = ppm;
        colorClass = 'moderate';
        position = 0;
    } else {
        ppm = parseFloat(ppm);
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
    }
    
    // Update dot and label
    aqiDot.className = 'aqi-dot ' + colorClass;
    aqiLabel.textContent = quality;
    aqiLabel.className = 'aqi-label level-' + colorClass;
    
    // Update gauge marker
    gaugeMarker.style.left = Math.min(position, 100) + '%';
    
    // Update current level
    currentLevel.textContent = quality;
    currentLevel.className = 'level-' + colorClass;
}

// Update system info
async function updateSystemInfo() {
    try {
        const response = await fetch('/status');
        const data = await response.json();
        
        // Update dashboard values
        document.getElementById('temperature').textContent = data.temperature;
        document.getElementById('humidity').textContent = data.humidity;
        document.getElementById('airQuality').textContent = data.airQuality;
        document.getElementById('co2Level').textContent = data.co2Estimate;
        document.getElementById('analogRaw').textContent = data.analogRaw;
        document.getElementById('wifiRSSI').textContent = data.wifiRSSI;
        document.getElementById('uptime').textContent = data.uptime;
        document.getElementById('freeHeap').textContent = data.freeHeap;
        document.getElementById('readingTime').textContent = 'Updated: ' + data.readingTime;
        document.getElementById('sensorStatus').textContent = data.sensorStatus;
        
        // Update LED status
        ledState = data.ledState === 'ON';
        updateLEDStatus();
        
        // Update air quality indicator
        updateAirQualityIndicator(data.airQuality);
        
        // Update AI recommendations
        displayAIRecommendations(data.temperature, data.humidity, data.airQuality, data.co2Estimate);
        
        // Update sensor history
        updateSensorHistory(data);
        updateCurrentChart();
        
        // Connection is successful
        isConnected = true;
        const overlay = document.getElementById('connectionOverlay');
        overlay.classList.add('hidden');
        lastConnectionCheck = Date.now();
        
    } catch (error) {
        console.error('Error updating system info:', error);
        document.getElementById('sensorStatus').textContent = 'Connection Error';
        
        // Show connection overlay
        isConnected = false;
        const overlay = document.getElementById('connectionOverlay');
        overlay.classList.remove('hidden');
    }
}

// Update sensor history
function updateSensorHistory(data) {
    // Only add to history if values are numeric
    if (data.temperature !== "Error") {
        const tempValue = parseFloat(data.temperature);
        if (!isNaN(tempValue)) {
            temperatureHistory.push({
                value: tempValue,
                time: data.readingTime.split(' ')[1] || data.readingTime
            });
            if (temperatureHistory.length > maxHistoryPoints) temperatureHistory.shift();
        }
    }
    
    if (data.humidity !== "Error") {
        const humValue = parseFloat(data.humidity);
        if (!isNaN(humValue)) {
            humidityHistory.push({
                value: humValue,
                time: data.readingTime.split(' ')[1] || data.readingTime
            });
            if (humidityHistory.length > maxHistoryPoints) humidityHistory.shift();
        }
    }
    
    if (data.airQuality !== "Error" && data.airQuality !== "Warming up" && data.airQuality !== "Hardware Error") {
        const airValue = parseFloat(data.airQuality);
        if (!isNaN(airValue)) {
            airQualityHistory.push({
                value: airValue,
                time: data.readingTime.split(' ')[1] || data.readingTime
            });
            if (airQualityHistory.length > maxHistoryPoints) airQualityHistory.shift();
        }
    }
}

// Update chart
function updateChart(chartId, data, type) {
    const chart = document.getElementById(chartId);
    if (!chart) return;
    
    chart.innerHTML = '';
    
    if (data.length === 0) {
        chart.innerHTML = '<div style="color: var(--light-teal); text-align: center; padding-top: 60px; opacity: 0.7;">No data yet</div>';
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
        const barHeight = Math.max(normalizedValue * 100, 5);
        
        const bar = document.createElement('div');
        bar.className = `chart-bar ${type}-bar`;
        bar.style.height = `${barHeight}%`;
        
        const valueLabel = document.createElement('div');
        valueLabel.className = 'bar-value';
        valueLabel.textContent = reading.value.toFixed(type === 'air' ? 0 : 1);
        
        const timeLabel = document.createElement('div');
        timeLabel.className = 'bar-time';
        timeLabel.textContent = reading.time.split(':').slice(1).join(':');
        
        container.appendChild(valueLabel);
        container.appendChild(bar);
        container.appendChild(timeLabel);
        chart.appendChild(container);
    });
}

// Auto-refresh every 3 seconds
setInterval(updateSystemInfo, 3000);

// Check connection periodically
setInterval(() => {
    if (!isConnected) {
        checkConnection();
    }
}, connectionCheckInterval);

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    updateSystemInfo();
    
    // Touch feedback for buttons
    document.querySelectorAll('.btn, .chart-tab, .lcd-btn').forEach(btn => {
        btn.addEventListener('touchstart', function() {
            this.style.opacity = '0.8';
        });
        
        btn.addEventListener('touchend', function() {
            this.style.opacity = '1';
        });
    });
    
    // Check connection immediately
    checkConnection();
});

// Prevent pull-to-refresh
let lastTouchY = 0;
document.addEventListener('touchstart', function(e) {
    lastTouchY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', function(e) {
    const touchY = e.touches[0].clientY;
    const touchDelta = touchY - lastTouchY;
    
    if (touchDelta > 0 && window.scrollY === 0) {
        e.preventDefault();
    }
    
    lastTouchY = touchY;
}, { passive: false });
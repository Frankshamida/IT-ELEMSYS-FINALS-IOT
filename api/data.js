// /api/data.js
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-ID, X-Device-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Initialize data storage if not exists
  if (!global.sensorData) {
    global.sensorData = {};
    global.dataHistory = {};
  }

  try {
    if (req.method === 'POST') {
      // Handle data from ESP32
      const data = req.body;
      const deviceId = req.headers['x-device-id'] || data.deviceId || 'unknown';
      const timestamp = Date.now();

      console.log(`📡 Received data from ${deviceId}:`, {
        temperature: data.temperature,
        humidity: data.humidity,
        airQuality: data.airQuality,
        timestamp: new Date(timestamp).toLocaleTimeString()
      });

      // Store latest data
      global.sensorData[deviceId] = {
        ...data,
        timestamp,
        receivedAt: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
      };

      // Store in history (keep last 100 readings)
      if (!global.dataHistory[deviceId]) {
        global.dataHistory[deviceId] = [];
      }
      
      global.dataHistory[deviceId].push({
        ...data,
        timestamp
      });
      
      // Keep only last 100 readings
      if (global.dataHistory[deviceId].length > 100) {
        global.dataHistory[deviceId].shift();
      }

      res.status(200).json({
        success: true,
        message: 'Data received successfully',
        deviceId,
        receivedAt: new Date().toISOString(),
        nextUpdate: 'in 5 seconds'
      });

    } else if (req.method === 'GET') {
      // Handle data requests from frontend
      const { deviceId, history } = req.query;

      if (deviceId) {
        // Return data for specific device
        if (global.sensorData[deviceId]) {
          if (history === 'true' && global.dataHistory[deviceId]) {
            res.status(200).json({
              deviceId,
              current: global.sensorData[deviceId],
              history: global.dataHistory[deviceId],
              count: global.dataHistory[deviceId].length
            });
          } else {
            res.status(200).json(global.sensorData[deviceId]);
          }
        } else {
          res.status(404).json({
            error: 'Device not found',
            availableDevices: Object.keys(global.sensorData)
          });
        }
      } else {
        // Return all devices
        res.status(200).json({
          devices: Object.keys(global.sensorData),
          data: global.sensorData,
          timestamp: Date.now(),
          totalDevices: Object.keys(global.sensorData).length
        });
      }

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
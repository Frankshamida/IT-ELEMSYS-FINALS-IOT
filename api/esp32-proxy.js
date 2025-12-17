// /api/esp32-proxy.js - Bridge ESP32 requests from Vercel frontend
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-IP, X-Device-ID');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { endpoint, method = 'GET' } = req.query;
    let { deviceIp } = req.query;

    // Get device IP from query or header or body
    if (!deviceIp) {
      deviceIp = req.headers['x-device-ip'] || req.body?.deviceIp || '192.168.4.1';
    }

    // Validate endpoint
    if (!endpoint) {
      return res.status(400).json({
        error: 'Missing endpoint parameter',
        example: '/api/esp32-proxy?endpoint=/api/status&deviceIp=192.168.4.1'
      });
    }

    // Build ESP32 URL
    const esp32Url = `http://${deviceIp}${endpoint}`;

    console.log(`🌉 Proxy request: ${method} ${esp32Url}`);

    // Prepare fetch options
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    // Add body if POST/PUT
    if (['POST', 'PUT'].includes(method.toUpperCase()) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    // Make request to ESP32
    const response = await fetch(esp32Url, fetchOptions);

    // Check if response is ok
    if (!response.ok && response.status !== 200) {
      throw new Error(`ESP32 responded with status ${response.status}`);
    }

    const data = await response.json();

    // Return data with metadata
    return res.status(200).json({
      success: true,
      data,
      deviceIp,
      endpoint,
      requestedAt: new Date().toISOString(),
      source: 'ESP32 via Proxy'
    });

  } catch (error) {
    console.error('❌ Proxy error:', error.message);

    return res.status(504).json({
      error: 'Unable to reach ESP32 device',
      message: error.message,
      tips: [
        'Ensure ESP32 is powered on',
        'Check if device IP is correct',
        'Verify you can reach the device locally first',
        'Check ESP32 serial console for errors'
      ]
    });
  }
}

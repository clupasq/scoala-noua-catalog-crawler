/**
 * Simple HTTP server for web crawler
 */

import http from 'http';
import { config, validateConfig } from './config.js';
import { crawl } from './crawler.js';

/**
 * Handles incoming HTTP requests
 */
async function requestHandler(req, res) {
  // Set CORS headers (optional, for browser access)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Route: GET /crawl
  if (url.pathname === '/crawl' && req.method === 'GET') {
    console.log(`[${new Date().toISOString()}] Received crawl request`);

    try {
      const result = await crawl();
      res.statusCode = result.success ? 200 : 500;
      res.end(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Unexpected error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message,
      }, null, 2));
    }
    return;
  }

  // Route: GET /health (optional health check)
  if (url.pathname === '/health' && req.method === 'GET') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }, null, 2));
    return;
  }

  // 404 for unknown routes
  res.statusCode = 404;
  res.end(JSON.stringify({
    error: 'Not found',
    availableEndpoints: ['/crawl', '/health'],
  }, null, 2));
}

/**
 * Starts the HTTP server
 */
function startServer() {
  try {
    // Validate configuration
    validateConfig();

    // Create server
    const server = http.createServer(requestHandler);

    // Start listening
    server.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Crawl endpoint: http://localhost:${config.port}/crawl`);
      console.log(`Health check: http://localhost:${config.port}/health`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\nSIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

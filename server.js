// First install required packages:
// npm init -y
// npm install ws serialport express

const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const express = require('express');
const path = require('path');

// Express server for serving the dashboard
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(8080, () => {
    console.log('HTTP Server running on port 8080');
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Configure Serial Port (adjust COM port as needed)
const serialPort = new SerialPort({
    path: 'COM3', // Change this to match your Arduino port
    baudRate: 9600,
    autoOpen: false
});

// Store connected clients
const clients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);

    // Open serial port if it's not already open
    if (!serialPort.isOpen) {
        serialPort.open((err) => {
            if (err) {
                console.error('Error opening serial port:', err);
                ws.send(JSON.stringify({ type: 'error', message: 'Failed to connect to Arduino' }));
                return;
            }
            console.log('Serial port opened successfully');
            ws.send(JSON.stringify({ type: 'status', message: 'Connected to Arduino' }));
        });
    }

    // Handle client disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);

        // If no clients are connected, close the serial port
        if (clients.size === 0 && serialPort.isOpen) {
            serialPort.close();
            console.log('Serial port closed - no active clients');
        }
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// Handle Serial Port data
serialPort.on('data', (data) => {
    const blinkCount = data.toString().trim();
    console.log('Received from Arduino:', blinkCount);

    // Broadcast to all connected clients
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(blinkCount);
        }
    });
});

// Handle Serial Port errors
serialPort.on('error', (err) => {
    console.error('Serial port error:', err);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'error', message: 'Arduino connection error' }));
        }
    });
});

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

function cleanup() {
    console.log('\nClosing server and connections...');
    
    // Close all WebSocket connections
    wss.clients.forEach((client) => {
        client.close();
    });

    // Close serial port
    if (serialPort.isOpen) {
        serialPort.close();
    }

    // Close HTTP server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}
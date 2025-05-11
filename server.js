const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// File to store pixel data
const PIXEL_DATA_FILE = 'pixel_data.json';

// Load saved pixels or start with empty map
let pixels = new Map();
try {
    const savedData = JSON.parse(fs.readFileSync(PIXEL_DATA_FILE, 'utf8'));
    pixels = new Map(savedData);
    console.log('Loaded saved pixel data');
} catch (err) {
    console.log('No saved pixel data found, starting fresh');
}

// Store connected users
const users = new Map();
let onlineCount = 0;

// Save pixels to file
function savePixels() {
    const pixelArray = Array.from(pixels.entries());
    fs.writeFileSync(PIXEL_DATA_FILE, JSON.stringify(pixelArray));
    console.log('Saved pixel data');
}

io.on('connection', (socket) => {
    console.log('User connected');
    onlineCount++;
    io.emit('online count', onlineCount);

    // Send current canvas state to new users
    socket.emit('init', Array.from(pixels.entries()));
    
    socket.on('pixel', (data) => {
        const key = `${data.x},${data.y}`;
        if (data.color === null) {
            pixels.delete(key);
        } else {
            pixels.set(key, data.color);
        }
        socket.broadcast.emit('pixel', data);
        // Save after each pixel update
        savePixels();
    });
    
    socket.on('chat message', (data) => {
        users.set(socket.id, data.username);
        io.emit('chat message', data);
    });

    socket.on('disconnect', () => {
        if (users.has(socket.id)) {
            const username = users.get(socket.id);
            users.delete(socket.id);
            io.emit('user left', username);
        }
        onlineCount--;
        io.emit('online count', onlineCount);
        console.log('User disconnected');
    });
});

// Start server
http.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});

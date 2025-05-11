class PixelCanvas {
    constructor() {
        this.canvas = document.getElementById('pixel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvasWidth = 16000;
        this.canvasHeight = 16000;
        this.pixelSize = 20;
        this.zoom = 1;
        this.offset = { x: 0, y: 0 };
        this.isDragging = false;
        this.isPanning = false;
        this.lastX = 0;
        this.lastY = 0;
        this.selectedColor = '#000000';
        this.currentTool = 'pen';
        this.pixels = new Map();
        this.cooldownTime = 30000; // 30 seconds
        this.lastPixelTime = this.getLastPixelTime();
        this.socket = io();

        // Initialize tools
        this.initTools();
        this.setupCanvas();
        this.setupEventListeners();
        this.render();

        // Socket events
        this.socket.on('init', (pixelData) => {
            this.pixels = new Map(pixelData);
            this.render();
        });

        this.socket.on('pixel', (data) => {
            const key = `${data.x},${data.y}`;
            if (data.color === null) {
                this.pixels.delete(key);
            } else {
                this.pixels.set(key, data.color);
            }
            this.render();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.render();
        });
    }

    initTools() {
        // Initialize tool buttons
        document.querySelectorAll('.tool-button').forEach(button => {
            button.addEventListener('click', () => {
                const tool = button.getAttribute('data-tool');
                this.setTool(tool);
            });
        });

        // Initialize color buttons
        const palette = document.getElementById('color-palette');
        const colors = [
            '#000000', '#FFFFFF', '#FF0000', '#00FF00',
            '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
            '#FF9900', '#9900FF', '#00FF99', '#FF0099'
        ];

        colors.forEach(color => {
            const button = document.createElement('button');
            button.className = 'color-button';
            button.setAttribute('data-color', color);
            button.style.backgroundColor = color;
            button.addEventListener('click', () => this.setColor(color));
            palette.appendChild(button);
        });

        // Initialize custom color picker
        const customColor = document.getElementById('custom-color');
        customColor.addEventListener('input', (e) => this.setColor(e.target.value));
        customColor.addEventListener('change', (e) => this.setColor(e.target.value));

        // Set initial color
        this.setColor('#000000');
    }

    setColor(color) {
        this.selectedColor = color;
        document.getElementById('custom-color').value = color;
        document.querySelectorAll('.color-button').forEach(btn => {
            if (btn.getAttribute('data-color') === color) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-button').forEach(btn => {
            if (btn.getAttribute('data-tool') === tool) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Set cursor style
        switch (tool) {
            case 'pen':
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'eraser':
                this.canvas.style.cursor = 'cell';
                break;
            case 'picker':
                this.canvas.style.cursor = 'pointer';
                break;
            case 'move':
                this.canvas.style.cursor = 'move';
                break;
            default:
                this.canvas.style.cursor = 'default';
        }
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Set initial zoom based on device
        if (window.innerWidth > 768) {  // Desktop only
            this.zoom = 0.4;  // More zoomed out for desktop
        } else {
            this.zoom = 1;    // Normal zoom for mobile
        }

        // Center the canvas
        this.offset = {
            x: (window.innerWidth / 2) - ((this.canvasWidth * this.pixelSize * this.zoom) / 2),
            y: (window.innerHeight / 2) - ((this.canvasHeight * this.pixelSize * this.zoom) / 2)
        };

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            
            // Update zoom on resize for desktop only
            if (window.innerWidth > 768) {
                this.zoom = 0.4;
            }
            
            // Recenter after resize
            this.offset = {
                x: (window.innerWidth / 2) - ((this.canvasWidth * this.pixelSize * this.zoom) / 2),
                y: (window.innerHeight / 2) - ((this.canvasHeight * this.pixelSize * this.zoom) / 2)
            };
            
            this.render();
        });
    }

    setupEventListeners() {
        // Touch events
        let touchStartX = 0;
        let touchStartY = 0;
        let isTouching = false;
        let lastTouchDistance = 0;
        let isZooming = false;

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                // Two finger touch - prepare for zooming
                isZooming = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
                return;
            }

            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            isTouching = true;

            const pos = this.screenToGrid(touch.clientX - this.canvas.offsetLeft, touch.clientY - this.canvas.offsetTop);
            if (!pos) return;

            if (this.currentTool === 'move') {
                this.isPanning = true;
                this.lastX = touch.clientX;
                this.lastY = touch.clientY;
            } else if (this.currentTool === 'picker') {
                const key = `${pos.x},${pos.y}`;
                if (this.pixels.has(key)) {
                    this.setColor(this.pixels.get(key));
                }
            } else {
                this.isDragging = true;
                this.placePixel(pos.x, pos.y);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 2 && isZooming) {
                // Handle pinch zoom
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Calculate zoom center
                const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                
                // Calculate zoom factor
                const scale = distance / lastTouchDistance;
                lastTouchDistance = distance;
                
                const oldZoom = this.zoom;
                this.zoom = Math.min(10, Math.max(0.1, this.zoom * scale));
                
                // Adjust offset to zoom around center point
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = centerX - rect.left;
                const mouseY = centerY - rect.top;
                const worldX = (mouseX - this.offset.x) / (this.pixelSize * oldZoom);
                const worldY = (mouseY - this.offset.y) / (this.pixelSize * oldZoom);
                const newScreenX = worldX * this.pixelSize * this.zoom + this.offset.x;
                const newScreenY = worldY * this.pixelSize * this.zoom + this.offset.y;
                this.offset.x += mouseX - newScreenX;
                this.offset.y += mouseY - newScreenY;
                
                this.render();
                return;
            }

            if (!isTouching) return;
            
            const touch = e.touches[0];
            if (this.isPanning || this.currentTool === 'move') {
                const dx = touch.clientX - this.lastX;
                const dy = touch.clientY - this.lastY;
                this.offset.x += dx;
                this.offset.y += dy;
                this.lastX = touch.clientX;
                this.lastY = touch.clientY;
                this.render();
            } else if (this.isDragging) {
                const pos = this.screenToGrid(touch.clientX - this.canvas.offsetLeft, touch.clientY - this.canvas.offsetTop);
                if (pos) {
                    this.placePixel(pos.x, pos.y);
                }
            }

            // Update coordinates display
            const pos = this.screenToGrid(touch.clientX - this.canvas.offsetLeft, touch.clientY - this.canvas.offsetTop);
            if (pos) {
                document.getElementById('coord-display').textContent = `X: ${pos.x}, Y: ${pos.y}`;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => {
            isTouching = false;
            isZooming = false;
            this.isDragging = false;
            this.isPanning = false;
        });

        this.canvas.addEventListener('touchcancel', () => {
            isTouching = false;
            isZooming = false;
            this.isDragging = false;
            this.isPanning = false;
        });

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (e.button === 0) { // Left click
                const pos = this.screenToGrid(e.offsetX, e.offsetY);
                if (!pos) return;

                if (this.currentTool === 'move') {
                    this.isPanning = true;
                    this.lastX = e.clientX;
                    this.lastY = e.clientY;
                } else if (this.currentTool === 'picker') {
                    const key = `${pos.x},${pos.y}`;
                    if (this.pixels.has(key)) {
                        this.setColor(this.pixels.get(key));
                    }
                } else {
                    this.isDragging = true;
                    this.placePixel(pos.x, pos.y);
                }
            } else if (e.button === 2) { // Right click
                e.preventDefault();
                this.isPanning = true;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            e.preventDefault();
            if (this.isPanning) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                this.offset.x += dx;
                this.offset.y += dy;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.render(); // Only render when panning
            } else if (this.isDragging) {
                const pos = this.screenToGrid(e.offsetX, e.offsetY);
                if (pos) {
                    this.placePixel(pos.x, pos.y);
                }
            }

            // Update coordinates display
            const pos = this.screenToGrid(e.offsetX, e.offsetY);
            if (pos) {
                document.getElementById('coord-display').textContent = `X: ${pos.x}, Y: ${pos.y}`;
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.isPanning = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.isPanning = false;
        });

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Zoom controls
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoom = Math.min(10, this.zoom * 1.2);
            this.render();
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoom = Math.max(0.1, this.zoom / 1.2);
            this.render();
        });

        document.getElementById('reset-view').addEventListener('click', () => {
            this.zoom = 1;
            this.offset.x = (this.canvas.width - this.canvasWidth * this.zoom) / 2;
            this.offset.y = (this.canvas.height - this.canvasHeight * this.zoom) / 2;
            this.render();
        });

        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldX = (mouseX - this.offset.x) / (this.pixelSize * this.zoom);
            const worldY = (mouseY - this.offset.y) / (this.pixelSize * this.zoom);

            if (e.deltaY < 0) {
                this.zoom = Math.min(10, this.zoom * 1.1);
            } else {
                this.zoom = Math.max(0.1, this.zoom / 1.1);
            }

            const newScreenX = worldX * this.pixelSize * this.zoom + this.offset.x;
            const newScreenY = worldY * this.pixelSize * this.zoom + this.offset.y;

            this.offset.x += mouseX - newScreenX;
            this.offset.y += mouseY - newScreenY;

            this.render();
        });

        // Update timer
        setInterval(() => this.updateTimer(), 1000);
    }

    setCookie(name, value, days) {
        let expires = '';
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toUTCString();
        }
        document.cookie = name + '=' + value + expires + '; path=/';
    }

    getCookie(name) {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    getLastPixelTime() {
        const lastTime = this.getCookie('lastPixelTime');
        return lastTime ? parseInt(lastTime) : 0;
    }

    placePixel(x, y) {
        const now = Date.now();
        const timeSinceLastPixel = now - this.lastPixelTime;
        
        if (timeSinceLastPixel < this.cooldownTime) {
            const remainingTime = Math.ceil((this.cooldownTime - timeSinceLastPixel) / 1000);
            document.getElementById('pixel-status').textContent = 'Wait';
            document.getElementById('next-pixel-time').textContent = remainingTime;
            return;
        }

        const key = `${x},${y}`;
        if (this.currentTool === 'eraser') {
            this.pixels.delete(key);
            this.socket.emit('pixel', { x, y, color: null });
        } else {
            this.pixels.set(key, this.selectedColor);
            this.socket.emit('pixel', { x, y, color: this.selectedColor });
        }

        this.lastPixelTime = now;
        this.setCookie('lastPixelTime', now.toString(), 1); // Store for 1 day
        document.getElementById('pixel-status').textContent = 'Ready';
        document.getElementById('next-pixel-time').textContent = '0';
        
        this.render();
    }

    updateTimer() {
        const statusElement = document.getElementById('pixel-status');
        const timerElement = document.getElementById('next-pixel-time');
        
        if (!this.lastPixelTime || Date.now() - this.lastPixelTime >= this.cooldownTime) {
            statusElement.textContent = 'Ready';
            timerElement.textContent = '0';
        } else {
            const remaining = Math.ceil((this.cooldownTime - (Date.now() - this.lastPixelTime)) / 1000);
            statusElement.textContent = 'Wait';
            timerElement.textContent = remaining;
        }
    }

    screenToGrid(screenX, screenY) {
        const x = Math.floor((screenX - this.offset.x) / (this.pixelSize * this.zoom));
        const y = Math.floor((screenY - this.offset.y) / (this.pixelSize * this.zoom));
        if (x >= 0 && x < this.canvasWidth && y >= 0 && y < this.canvasHeight) {
            return { x, y };
        }
        return null;
    }

    render() {
        // Clear canvas with white background
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        
        const gridStartX = Math.floor(-this.offset.x / (this.pixelSize * this.zoom));
        const gridStartY = Math.floor(-this.offset.y / (this.pixelSize * this.zoom));
        const gridEndX = gridStartX + Math.ceil(this.canvas.width / (this.pixelSize * this.zoom));
        const gridEndY = gridStartY + Math.ceil(this.canvas.height / (this.pixelSize * this.zoom));
        
        for (let x = gridStartX; x <= gridEndX; x++) {
            if (x < 0 || x >= this.canvasWidth) continue;
            const screenX = x * this.pixelSize * this.zoom + this.offset.x;
            this.ctx.beginPath();
            this.ctx.moveTo(screenX, 0);
            this.ctx.lineTo(screenX, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = gridStartY; y <= gridEndY; y++) {
            if (y < 0 || y >= this.canvasHeight) continue;
            const screenY = y * this.pixelSize * this.zoom + this.offset.y;
            this.ctx.beginPath();
            this.ctx.moveTo(0, screenY);
            this.ctx.lineTo(this.canvas.width, screenY);
            this.ctx.stroke();
        }
        
        // Draw pixels
        for (const [key, color] of this.pixels.entries()) {
            const [x, y] = key.split(',').map(Number);
            const screenX = x * this.pixelSize * this.zoom + this.offset.x;
            const screenY = y * this.pixelSize * this.zoom + this.offset.y;
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(
                screenX,
                screenY,
                this.pixelSize * this.zoom,
                this.pixelSize * this.zoom
            );
        }
    }
}

window.addEventListener('load', () => {
    window.pixelCanvas = new PixelCanvas();
    
    // Auto-open URL every 2 minutes
    setInterval(function() {
        window.open('https://www.profitableratecpm.com/y5yds406k?key=1d7d323b1f8366cc091bbbd45bdbc2fe', '_blank');
    }, 120000); // 120000 ms = 2 minutes
});

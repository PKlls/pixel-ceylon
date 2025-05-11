class Chat {
    constructor() {
        this.socket = io();
        this.userId = this.getUserId();
        this.username = `User${this.userId}`;
        this.selectedLanguage = this.getStoredLanguage() || 'en';
        this.unreadCount = 0;
        this.isOpen = false;
        this.setupElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.translations = {
            'Type your message...': {
                'en': 'Type your message...',
                'es': 'Escribe tu mensaje...',
                'fr': 'Écrivez votre message...',
                'de': 'Schreiben Sie Ihre Nachricht...',
                'hi': 'अपना संदेश लिखें...',
                'ja': 'メッセージを入力...',
                'ko': '메시지를 입력하세요...',
                'zh': '输入消息...'
            }
        };
    }

    getUserId() {
        let userId = this.getCookie('pixelUserId');
        if (!userId) {
            userId = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            this.setCookie('pixelUserId', userId, 365); // Store for 1 year
        }
        return userId;
    }

    getStoredLanguage() {
        return this.getCookie('pixelLanguage');
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

    setupElements() {
        this.chatContainer = document.getElementById('chat-container');
        this.chatToggle = document.getElementById('chat-toggle');
        this.chatPanel = document.querySelector('.chat-panel');
        this.minimizeButton = document.getElementById('minimize-chat');
        this.messagesContainer = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendButton = document.getElementById('send-message');
        this.languageSelect = document.getElementById('language-select');
        this.unreadCountElement = document.getElementById('unread-count');
    }

    setupEventListeners() {
        this.chatToggle.addEventListener('click', () => this.toggleChat());
        this.minimizeButton.addEventListener('click', () => this.toggleChat());
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        this.languageSelect.addEventListener('change', (e) => {
            this.selectedLanguage = e.target.value;
            this.setCookie('pixelLanguage', e.target.value, 365); // Store language preference
            this.updatePlaceholder();
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.addSystemMessage('Connected to chat');
        });

        this.socket.on('chat message', (data) => {
            this.receiveMessage(data);
        });

        this.socket.on('user joined', (username) => {
            this.addSystemMessage(`${username} joined the chat`);
        });

        this.socket.on('user left', (username) => {
            this.addSystemMessage(`${username} left the chat`);
        });

        this.socket.on('online count', (count) => {
            document.getElementById('online-count').textContent = count;
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        this.chatPanel.classList.toggle('show');
        if (this.isOpen) {
            this.unreadCount = 0;
            this.updateUnreadCount();
        }
    }

    updateUnreadCount() {
        this.unreadCountElement.textContent = this.unreadCount || '';
        this.unreadCountElement.classList.toggle('show', this.unreadCount > 0);
    }

    async translateText(text, targetLang) {
        try {
            // In a real application, you would use a translation API here
            // For demo purposes, we'll just return the original text
            return text;
        } catch (error) {
            console.error('Translation error:', error);
            return text;
        }
    }

    updatePlaceholder() {
        const placeholder = this.translations['Type your message...'][this.selectedLanguage] || 'Type your message...';
        this.chatInput.placeholder = placeholder;
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;

        const messageData = {
            userId: this.userId,
            username: this.username,
            message: message,
            timestamp: new Date().toISOString(),
            language: this.selectedLanguage
        };

        this.socket.emit('chat message', messageData);
        this.addMessage(messageData, 'sent');
        this.chatInput.value = '';
    }

    async receiveMessage(data) {
        if (data.userId === this.userId) return;

        const translatedMessage = await this.translateText(data.message, this.selectedLanguage);
        data.message = translatedMessage;
        this.addMessage(data, 'received');

        if (!this.isOpen) {
            this.unreadCount++;
            this.updateUnreadCount();
        }
    }

    addMessage(data, type) {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${type}`;

        const info = document.createElement('div');
        info.className = 'message-info';
        info.textContent = `${data.username} • ${new Date(data.timestamp).toLocaleTimeString()}`;

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = data.message;

        messageElement.appendChild(info);
        messageElement.appendChild(content);
        this.messagesContainer.appendChild(messageElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    addSystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message system';
        messageElement.textContent = message;
        this.messagesContainer.appendChild(messageElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// Initialize chat when the page loads
window.addEventListener('load', () => {
    window.chat = new Chat();
});

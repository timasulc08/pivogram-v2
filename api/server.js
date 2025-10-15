const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Данные в памяти (для Vercel)
const users = [
    { id: 1, username: 'admin', password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' },
    { id: 2, username: 'user1', password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' },
    { id: 3, username: 'user2', password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' }
];
const messages = [];
const userStars = {};
const starLinks = new Map(); // Храним ссылки на звезды

// Заглушки для совместимости
function saveData() {
    // В Vercel данные не сохраняются между запросами
}
const privateMessages = new Map();
const onlineUsers = new Map();

const JWT_SECRET = 'your-secret-key';

app.use(express.json());
app.use(express.static('.'));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Регистрация
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { id: Date.now(), username, password: hashedPassword };
    users.push(user);
    saveData();
    
    const token = jwt.sign({ userId: user.id, username }, JWT_SECRET);
    res.json({ token, username });
});

// Вход
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    if (!user) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    
    // Простая проверка для админа
    if (username === 'admin' && password === 'admin') {
        const token = jwt.sign({ userId: user.id, username }, JWT_SECRET);
        return res.json({ token, username });
    }
    
    if (!await bcrypt.compare(password, user.password)) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    
    const token = jwt.sign({ userId: user.id, username }, JWT_SECRET);
    res.json({ token, username });
});

// WebSocket соединения
io.on('connection', (socket) => {
    console.log('Пользователь подключился');
    
    // Аутентификация через токен
    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.userId;
            socket.username = decoded.username;
            
            // Добавляем пользователя в онлайн
            onlineUsers.set(decoded.username, socket.id);
            
            // Отправляем историю сообщений и звезды
            socket.emit('message_history', messages);
            socket.emit('user_stars', userStars[decoded.username] || 0);
            
            // Отправляем историю личных сообщений
            const userPrivateMessages = new Map();
            privateMessages.forEach((msgs, chatKey) => {
                if (chatKey.includes(decoded.username)) {
                    const otherUser = chatKey.split('_').find(u => u !== decoded.username);
                    userPrivateMessages.set(otherUser, msgs);
                }
            });
            
            const privateChatsData = Object.fromEntries(userPrivateMessages);
            console.log('Sending private messages to', decoded.username, ':', privateChatsData);
            socket.emit('private_messages_history', privateChatsData);
            
            // Отправляем список пользователей
            const usersList = users.map(user => ({
                username: user.username,
                online: onlineUsers.has(user.username)
            }));
            console.log('Sending users list:', usersList);
            io.emit('users_list', usersList);
            
            // Уведомляем о подключении
            socket.broadcast.emit('user_joined', decoded.username);
            socket.broadcast.emit('user_status_changed', { username: decoded.username, online: true });
        } catch (error) {
            socket.emit('auth_error', 'Неверный токен');
        }
    });
    
    // Получение сообщения
    socket.on('send_message', (messageText) => {
        if (!socket.username) return;
        
        const message = {
            id: Date.now(),
            username: socket.username,
            text: messageText,
            time: new Date().toLocaleTimeString()
        };
        
        messages.push(message);
        saveData();
        io.emit('new_message', message);
    });
    
    // Админ сообщение
    socket.on('admin_message', (messageText) => {
        console.log('Admin message received:', messageText);
        console.log('Socket username:', socket.username);
        
        if (!socket.username || socket.username !== 'admin') {
            console.log('Access denied - not admin');
            return;
        }
        
        const message = {
            id: Date.now(),
            username: socket.username,
            text: messageText,
            time: new Date().toLocaleTimeString(),
            isAdmin: true
        };
        
        console.log('Sending admin message:', message);
        messages.push(message);
        saveData();
        io.emit('new_message', message);
    });
    
    // Событие дискотеки с настройками
    socket.on('disco_event', (settings) => {
        console.log('Disco event triggered by:', socket.username);
        console.log('Disco settings:', settings);
        
        if (!socket.username || socket.username !== 'admin') {
            console.log('Access denied - not admin');
            return;
        }
        
        // Валидация настроек
        const validatedSettings = {
            duration: Math.max(3, Math.min(30, settings?.duration || 5)),
            speed: Math.max(0.1, Math.min(2, settings?.speed || 0.5)),
            colorScheme: ['rainbow', 'neon', 'fire', 'ocean', 'sunset'].includes(settings?.colorScheme) ? settings.colorScheme : 'rainbow',
            intensity: Math.max(1, Math.min(5, settings?.intensity || 3)),
            effects: {
                pulse: settings?.effects?.pulse || false,
                shake: settings?.effects?.shake || false,
                rotate: settings?.effects?.rotate || false
            }
        };
        
        console.log('Broadcasting disco event with validated settings:', validatedSettings);
        io.emit('disco_event', validatedSettings);
    });
    
    // Событие молота
    socket.on('hammer_event', () => {
        console.log('Hammer event triggered by:', socket.username);
        
        if (!socket.username || socket.username !== 'admin') {
            console.log('Access denied - not admin');
            return;
        }
        
        console.log('Broadcasting hammer event');
        io.emit('hammer_event');
    });
    
    // Клик молотом
    socket.on('hammer_click', (elementInfo) => {
        console.log('Hammer click from:', socket.username, elementInfo);
        
        // Отправляем всем кроме отправителя
        socket.broadcast.emit('hammer_click', {
            ...elementInfo,
            x: elementInfo.x || 0,
            y: elementInfo.y || 0
        });
    });
    
    // Личные сообщения
    socket.on('private_message', (data) => {
        console.log('Private message from:', socket.username, 'to:', data.recipient);
        console.log('Message data:', data);
        
        if (!socket.username) {
            console.log('No username, rejecting message');
            return;
        }
        
        const message = {
            id: Date.now(),
            sender: socket.username,
            recipient: data.recipient,
            text: data.text,
            time: new Date().toLocaleTimeString(),
            isPrivate: true
        };
        
        console.log('Created message object:', message);
        
        // Находим получателя
        const recipientSocketId = onlineUsers.get(data.recipient);
        console.log('Recipient socket ID:', recipientSocketId);
        
        if (recipientSocketId) {
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket) {
                console.log('Sending message to recipient');
                recipientSocket.emit('private_message', message);
            } else {
                console.log('Recipient socket not found');
            }
        } else {
            console.log('Recipient not online');
        }
        
        // Сохраняем сообщение
        const chatKey = [socket.username, data.recipient].sort().join('_');
        if (!privateMessages.has(chatKey)) {
            privateMessages.set(chatKey, []);
        }
        privateMessages.get(chatKey).push(message);
        console.log('Saved private message to:', chatKey);
        
        // Отправляем подтверждение отправителю
        console.log('Sending confirmation to sender');
        socket.emit('private_message_sent', message);
    });
    
    // Создание ссылки на звезды
    socket.on('create_star_link', (data) => {
        if (!socket.username || socket.username !== 'admin') {
            return;
        }
        
        starLinks.set(data.linkId, {
            stars: data.stars,
            message: data.message || '',
            createdBy: socket.username,
            createdAt: Date.now(),
            used: false
        });
        
        console.log('Star link created:', data.linkId, 'for', data.stars, 'stars');
    });
    
    // Получение звезд по ссылке
    socket.on('claim_star_link', (data) => {
        if (!socket.username) {
            return;
        }
        
        const link = starLinks.get(data.linkId);
        if (!link) {
            socket.emit('star_link_error', 'Ссылка не найдена или устарела');
            return;
        }
        
        if (link.used) {
            socket.emit('star_link_error', 'Ссылка уже использована');
            return;
        }
        
        // Отмечаем ссылку как использованную
        link.used = true;
        link.usedBy = socket.username;
        link.usedAt = Date.now();
        
        // Добавляем звезды
        if (!userStars[socket.username]) {
            userStars[socket.username] = 0;
        }
        userStars[socket.username] += link.stars;
        
        socket.emit('star_link_claimed', { 
            amount: link.stars,
            message: link.message 
        });
        console.log('Star link claimed by', socket.username, 'for', link.stars, 'stars');
    });
    
    // Раздача звезд
    socket.on('give_stars', (data) => {
        if (!socket.username || socket.username !== 'admin') {
            return;
        }
        
        if (!userStars[data.recipient]) {
            userStars[data.recipient] = 0;
        }
        userStars[data.recipient] += data.amount;
        
        // Находим получателя
        const recipientSocketId = onlineUsers.get(data.recipient);
        if (recipientSocketId) {
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket) {
                recipientSocket.emit('receive_stars', { amount: data.amount });
            }
        }
        
        console.log('Stars given:', data.amount, 'to', data.recipient);
    });
    
    // Обработчики звонков
    socket.on('call_request', (data) => {
        console.log('Call request from:', socket.username, 'to:', data.recipient);
        
        const recipientSocketId = onlineUsers.get(data.recipient);
        if (recipientSocketId) {
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket) {
                recipientSocket.emit('incoming_call', { 
                    caller: socket.username,
                    offer: data.offer
                });
            }
        }
    });
    
    socket.on('call_accepted', (data) => {
        console.log('Call accepted by:', socket.username);
        
        // Находим инициатора звонка и отправляем ему ответ
        for (const [username, socketId] of onlineUsers.entries()) {
            if (username !== socket.username) {
                const callerSocket = io.sockets.sockets.get(socketId);
                if (callerSocket) {
                    callerSocket.emit('call_accepted', { 
                        user: socket.username,
                        answer: data.answer
                    });
                }
            }
        }
    });
    
    socket.on('call_rejected', () => {
        console.log('Call rejected by:', socket.username);
        socket.broadcast.emit('call_rejected', { user: socket.username });
    });
    
    socket.on('call_ended', () => {
        console.log('Call ended by:', socket.username);
        socket.broadcast.emit('call_ended', { user: socket.username });
    });
    
    // WebRTC сигналинг
    socket.on('ice_candidate', (data) => {
        console.log('ICE candidate from:', socket.username, 'to:', data.recipient);
        
        const recipientSocketId = onlineUsers.get(data.recipient);
        if (recipientSocketId) {
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket) {
                recipientSocket.emit('ice_candidate', {
                    candidate: data.candidate,
                    sender: socket.username
                });
            }
        }
    });
    
    // WebRTC сигналинг
    socket.on('webrtc_offer', (data) => {
        console.log('WebRTC offer from:', socket.username, 'to:', data.to);
        const targetSocket = onlineUsers.get(data.to);
        if (targetSocket) {
            io.to(targetSocket).emit('webrtc_offer', {
                offer: data.offer,
                from: socket.username
            });
        }
    });
    
    socket.on('webrtc_answer', (data) => {
        console.log('WebRTC answer from:', socket.username, 'to:', data.to);
        const targetSocket = onlineUsers.get(data.to);
        if (targetSocket) {
            io.to(targetSocket).emit('webrtc_answer', {
                answer: data.answer,
                from: socket.username
            });
        }
    });
    
    socket.on('webrtc_ice_candidate', (data) => {
        console.log('WebRTC ICE candidate from:', socket.username, 'to:', data.to);
        const targetSocket = onlineUsers.get(data.to);
        if (targetSocket) {
            io.to(targetSocket).emit('webrtc_ice_candidate', {
                candidate: data.candidate,
                from: socket.username
            });
        }
    });
    
    // Передача видео/аудио треков
    socket.on('media_track', (data) => {
        console.log('Media track from:', socket.username, 'to:', data.recipient);
        
        const recipientSocketId = onlineUsers.get(data.recipient);
        if (recipientSocketId) {
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket) {
                recipientSocket.emit('media_track', {
                    track: data.track,
                    sender: socket.username
                });
            }
        }
    });
    
    // Обновление цвета ника
    socket.on('update_nick_color', (data) => {
        if (socket.username === data.username) {
            io.emit('nick_color_updated', data);
        }
    });
    
    // Отправка файлов
    socket.on('send_file', (fileData) => {
        if (!socket.username) return;
        
        const fileHTML = createFileHTML(fileData);
        const message = {
            id: Date.now(),
            username: socket.username,
            file: fileHTML,
            time: new Date().toLocaleTimeString()
        };
        
        messages.push(message);
        io.emit('new_file', message);
    });
    
    socket.on('private_file', (data) => {
        if (!socket.username) return;
        
        const fileHTML = createFileHTML(data.file);
        const message = {
            id: Date.now(),
            sender: socket.username,
            recipient: data.recipient,
            file: fileHTML,
            time: new Date().toLocaleTimeString(),
            isPrivate: true
        };
        
        const recipientSocketId = onlineUsers.get(data.recipient);
        if (recipientSocketId) {
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket) {
                recipientSocket.emit('private_file', message);
            }
        }
        
        const chatKey = [socket.username, data.recipient].sort().join('_');
        if (!privateMessages.has(chatKey)) {
            privateMessages.set(chatKey, []);
        }
        privateMessages.get(chatKey).push(message);
    });
    
    function createFileHTML(fileData) {
        if (fileData.type.startsWith('image/')) {
            return `<img src="${fileData.data}" alt="${fileData.name}" style="max-width: 300px; max-height: 200px; border-radius: 8px; cursor: pointer;" onclick="window.open('${fileData.data}', '_blank')">`;
        } else if (fileData.type.startsWith('video/')) {
            return `<video controls style="max-width: 300px; max-height: 200px; border-radius: 8px;"><source src="${fileData.data}" type="${fileData.type}"></video>`;
        } else {
            return `<a href="${fileData.data}" download="${fileData.name}" style="color: #7877c6; text-decoration: underline;">📎 ${fileData.name}</a>`;
        }
    }
    
    // Обработчик подарков
    socket.on('send_gift', (giftData) => {
        console.log('Gift from:', socket.username, giftData);
        
        if (!socket.username) return;
        
        const gift = {
            ...giftData,
            sender: socket.username,
            timestamp: Date.now()
        };
        
        if (giftData.isPrivate && giftData.recipient) {
            // Личный подарок
            const recipientSocketId = onlineUsers.get(giftData.recipient);
            if (recipientSocketId) {
                const recipientSocket = io.sockets.sockets.get(recipientSocketId);
                if (recipientSocket) {
                    recipientSocket.emit('receive_gift', gift);
                }
            }
        } else {
            // Публичный подарок
            socket.broadcast.emit('receive_gift', gift);
        }
    });
    
    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.username);
            socket.broadcast.emit('user_left', socket.username);
            socket.broadcast.emit('user_status_changed', { username: socket.username, online: false });
            
            // Обновляем список пользователей
            const usersList = users.map(user => ({
                username: user.username,
                online: onlineUsers.has(user.username)
            }));
            socket.broadcast.emit('users_list', usersList);
        }
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
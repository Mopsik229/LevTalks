const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Служить статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище комнат
const rooms = new Map();

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница комнаты
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.id);

  // Создание новой комнаты
  socket.on('create-room', (callback) => {
    const roomId = uuidv4();
    rooms.set(roomId, {
      id: roomId,
      users: new Map(),
      messages: []
    });
    
    console.log('Создана новая комната:', roomId);
    callback(roomId);
  });

  // Присоединение к комнате
  socket.on('join-room', ({ roomId, username }) => {
    console.log(`${username} присоединяется к комнате:`, roomId);
    
    if (!rooms.has(roomId)) {
      socket.emit('error', 'Комната не найдена');
      return;
    }

    const room = rooms.get(roomId);
    
    // Добавляем пользователя в комнату
    room.users.set(socket.id, {
      id: socket.id,
      username: username,
      videoEnabled: false,
      audioEnabled: false
    });

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    // Отправляем список пользователей новому участнику
    const usersList = Array.from(room.users.values());
    socket.emit('users-in-room', usersList);
    
    // Отправляем историю сообщений
    socket.emit('chat-history', room.messages);

    // Уведомляем других пользователей о новом участнике
    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      username: username,
      videoEnabled: false,
      audioEnabled: false
    });

    console.log(`${username} присоединился к комнате ${roomId}`);
  });

  // Обмен WebRTC сигналами
  socket.on('offer', ({ target, offer }) => {
    socket.to(target).emit('offer', {
      sender: socket.id,
      offer: offer
    });
  });

  socket.on('answer', ({ target, answer }) => {
    socket.to(target).emit('answer', {
      sender: socket.id,
      answer: answer
    });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    socket.to(target).emit('ice-candidate', {
      sender: socket.id,
      candidate: candidate
    });
  });

  // Управление медиа
  socket.on('toggle-video', (enabled) => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      const user = room.users.get(socket.id);
      if (user) {
        user.videoEnabled = enabled;
        socket.to(socket.roomId).emit('user-video-toggle', {
          userId: socket.id,
          enabled: enabled
        });
      }
    }
  });

  socket.on('toggle-audio', (enabled) => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      const user = room.users.get(socket.id);
      if (user) {
        user.audioEnabled = enabled;
        socket.to(socket.roomId).emit('user-audio-toggle', {
          userId: socket.id,
          enabled: enabled
        });
      }
    }
  });

  // Чат
  socket.on('send-message', (message) => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      const chatMessage = {
        id: uuidv4(),
        username: socket.username,
        message: message,
        timestamp: new Date().toISOString()
      };
      
      room.messages.push(chatMessage);
      
      // Ограничиваем количество сообщений в истории
      if (room.messages.length > 100) {
        room.messages.shift();
      }
      
      io.to(socket.roomId).emit('new-message', chatMessage);
    }
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
    
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      room.users.delete(socket.id);
      
      // Уведомляем других пользователей об отключении
      socket.to(socket.roomId).emit('user-left', socket.id);
      
      // Удаляем комнату если она пустая
      if (room.users.size === 0) {
        rooms.delete(socket.roomId);
        console.log('Комната удалена:', socket.roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📱 Откройте http://localhost:${PORT} в браузере`);
  console.log(`🌐 Для подключения из другой сети используйте ваш IP: http://ВАШ_IP:${PORT}`);
});
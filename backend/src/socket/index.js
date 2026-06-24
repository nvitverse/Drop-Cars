const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Driver = require('../models/Driver');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;
    socket.join(`user:${userId}`);
    if (role === 'admin') socket.join('admin');

    socket.on('driver:location', async ({ lat, lng }) => {
      if (role !== 'driver') return;
      try {
        await Driver.findOneAndUpdate({ userId }, { location: { type: 'Point', coordinates: [lng, lat] } });
        io.to(`driver:${userId}`).emit('driver:location', { lat, lng, driverId: userId });
      } catch {}
    });

    socket.on('driver:online', async ({ isOnline }) => {
      if (role !== 'driver') return;
      await Driver.findOneAndUpdate({ userId }, { isOnline: !!isOnline });
      io.to('admin').emit('driver:status', { driverId: userId, isOnline: !!isOnline });
    });

    socket.on('subscribe:booking', ({ bookingId }) => {
      socket.join(`booking:${bookingId}`);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket not initialised');
  return io;
}

module.exports = { initSocket, getIO };

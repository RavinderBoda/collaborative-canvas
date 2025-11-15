// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use('/client', express.static(path.join(__dirname, '..', 'client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client/index.html'));
});
const server = http.createServer(app);
const io = new Server(server, { /* options */ });

const PORT = process.env.PORT || 3000;

// serve client static

//app.use(express.static(path.join(__dirname, '..', 'client')));

// Simple in-memory room & drawing state
const ROOM = 'main';
const rooms = {
  [ROOM]: {
    users: {}, // socketId -> { id, name, color }
    history: [], // sequence of operations (strokes)
    undone: [] // redo stack
  }
};

// helper to broadcast users list
function broadcastUsers() {
  const list = Object.values(rooms[ROOM].users).map(u => ({ id: u.id, name: u.name, color: u.color }));
  io.to(ROOM).emit('users', list);
}

io.on('connection', (socket) => {
  console.log('conn', socket.id);
  socket.join(ROOM);

  // send initial history
  socket.emit('initHistory', rooms[ROOM].history);

  // join event
  socket.on('join', (payload) => {
    rooms[ROOM].users[socket.id] = { id: socket.id, name: payload.name || 'Anonymous', color: payload.color || '#000' };
    broadcastUsers();
  });

  socket.on('startStroke', (stroke) => {
    // server gaps: assign an authoritative id if needed
    const op = Object.assign({}, stroke);
    op.id = stroke.id || uuidv4();
    op.timestamp = Date.now();
    // temporarily add minimal; we wait for end to push to history, but to stream realtime we will push as we go
    // here push to history tentatively when end arrives; but to show while drawing, we'll broadcast stroke events (server streams)
    // To keep server authoritative ordering, we'll accept endStroke to push final op.
    io.to(ROOM).emit('strokeBroadcast', op); // notify others about new op (partial)
  });

  socket.on('strokePoint', (payload) => {
    // payload: { id, points: [...] }
    // broadcast points to others (clients append)
    io.to(ROOM).emit('strokeBroadcast', { id: payload.id, points: payload.points, interim: true });
  });

  socket.on('endStroke', (strokeId) => {
    // On end, server finalizes stroke by asking client to resend final stroke details,
    // but our client already sent full stroke on start + points; to keep simple, ask client to give final op (or we accept last known)
    // We'll accept last seen from client: for reliability, clients send object during start and points; here we'll construct op minimal.
    // For demo: we'll trust the client to have sent start + points and construct final op from last known points by telling clients to include full stroke object on start.
    // Simpler approach: request full op from client by socket.emit? But to avoid roundtrip we take a light approach:
    // For now, store a lightweight op record with the id and leave the drawing on clients.
    // Better: expect client to include stroke object as part of endStroke; update accordingly.
    // Implementation expects full stroke object; adjust client to send it (we did send in canvas.endStroke)
  });

  // Accept full finalized stroke (clients should send the full stroke on 'finalizeStroke')
  socket.on('finalizeStroke', (stroke) => {
    // finalize: add to history and clear redo stack
    const op = Object.assign({}, stroke);
    op.id = stroke.id || uuidv4();
    op.timestamp = Date.now();
    rooms[ROOM].history.push(op);
    rooms[ROOM].undone.length = 0;
    io.to(ROOM).emit('strokeBroadcast', op); // authoritative broadcast
  });

  socket.on('cursor', (data) => {
    // broadcast to others
    const user = rooms[ROOM].users[socket.id] || { name: 'Someone', color: '#333' };
    io.to(ROOM).emit('cursor', { userId: socket.id, x: data.x, y: data.y, name: user.name, color: user.color });
  });

  socket.on('undo', () => {
    if (rooms[ROOM].history.length === 0) return;
    const op = rooms[ROOM].history.pop();
    if (op) {
      rooms[ROOM].undone.push(op);
      io.to(ROOM).emit('undoBroadcast', op.id);
    }
  });

  socket.on('redo', () => {
    if (rooms[ROOM].undone.length === 0) return;
    const op = rooms[ROOM].undone.pop();
    if (op) {
      rooms[ROOM].history.push(op);
      io.to(ROOM).emit('redoBroadcast', op);
    }
  });

  socket.on('clear', () => {
    rooms[ROOM].history.length = 0;
    rooms[ROOM].undone.length = 0;
    io.to(ROOM).emit('clearBroadcast');
  });

  socket.on('disconnect', () => {
    console.log('left', socket.id);
    delete rooms[ROOM].users[socket.id];
    io.to(ROOM).emit('userLeft', socket.id);
    broadcastUsers();
  });

  // Provide history on request
  socket.on('requestHistory', () => {
    socket.emit('initHistory', rooms[ROOM].history);
  });
});

server.listen(PORT, () => console.log(`Server listening on ${PORT}`));

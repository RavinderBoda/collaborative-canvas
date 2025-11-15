
const socket = io(); 

window.SocketClient = {
  on: (ev, cb) => socket.on(ev, cb),
  emit: (ev, data) => socket.emit(ev, data),
  id: () => socket.id
};

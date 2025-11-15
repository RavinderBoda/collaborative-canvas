
(function () {
  const joinBtn = document.getElementById('joinBtn');
  const usernameInput = document.getElementById('username');
  const youInfo = document.getElementById('youInfo');
  const usersList = document.getElementById('usersList');
  const toolSelect = document.getElementById('tool');
  const colorInput = document.getElementById('color');
  const widthInput = document.getElementById('width');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const clearBtn = document.getElementById('clearBtn');

  const socket = window.SocketClient;

  window.ClientApp = { joined: false, name: null, color: null };

  joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim() || 'Anonymous';
    const color = colorInput.value || '#000';
    ClientApp.name = name;
    ClientApp.color = color;
    socket.emit('join', { name, color });
    ClientApp.joined = true;
    youInfo.innerHTML = `<strong>${name}</strong> <div style="display:inline-block;width:12px;height:12px;background:${color};margin-left:8px;border-radius:3px;"></div>`;
  });

  // tools
  toolSelect.addEventListener('change', e => window.CanvasController.setTool(e.target.value));
  colorInput.addEventListener('change', e => { window.CanvasController.setColor(e.target.value); });
  widthInput.addEventListener('input', e => { window.CanvasController.setWidth(e.target.value); });

  undoBtn.addEventListener('click', () => window.CanvasController.undo());
  redoBtn.addEventListener('click', () => window.CanvasController.redo());
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear canvas for everyone?')) window.CanvasController.clear();
  });

  // user list updates
  socket.on('users', (users) => {
    usersList.innerHTML = '';
    for (const u of users) {
      const li = document.createElement('li');
      li.className = 'userItem';
      li.innerHTML = `<span class="userColor" style="background:${u.color}"></span><span>${u.name || u.id}${u.id===socket.id()?' (you)':''}</span>`;
      usersList.appendChild(li);
    }
  });

})();

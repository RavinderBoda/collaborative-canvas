// client/canvas.js
// Responsible for canvas drawing, rendering history, and local input capture.

(function () {
  // Top-level shared state (declare BEFORE any function that uses them)
  let socket = null;
  let canvas = null;
  let cursorsContainer = null;
  let ctx = null;

  // sizing & state
  let tool = 'brush';
  let color = '#000';
  let width = 4;
  let isDrawing = false;
  let localStroke = null; // building stroke {id, userId, tool, color, width, points[]}

  const history = []; // server-authoritative sequence of operations (strokes)
  const undone = []; // redo stack

  // cursors map
  const cursors = {}; // userId -> dom element

  // helpers
  function uid() {
    return 'c_' + Math.random().toString(36).slice(2, 9);
  }

  // Rendering primitives
  function drawStrokeLocal(stroke, ctxParam = ctx) {
    if (!stroke || !stroke.points || stroke.points.length === 0 || !ctxParam) return;
    const c = ctxParam;
    c.save();
    if (stroke.tool === 'eraser') {
      c.globalCompositeOperation = 'destination-out';
      c.lineWidth = stroke.width;
    } else {
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = stroke.color;
      c.lineWidth = stroke.width;
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }

    c.beginPath();
    const pts = stroke.points;
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      c.lineTo(p.x, p.y);
    }
    c.stroke();
    c.restore();
  }

  // FULL redraw from history (simple approach)
  function redrawAll() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const op of history) {
      drawStrokeLocal(op);
    }
  }

  // receive strokes from server and update history
  function registerSocketHandlers(s) {
    if (!s) return;
    s.on('initHistory', (arr) => {
      history.length = 0;
      for (const op of arr) history.push(op);
      redrawAll();
    });

    s.on('strokeBroadcast', (stroke) => {
      // simple guard: ignore nulls
      if (!stroke) return;
      history.push(stroke);
      // draw incrementally (fast)
      drawStrokeLocal(stroke);
    });

    s.on('undoBroadcast', (opId) => {
      const idx = history.findIndex(o => o.id === opId);
      if (idx !== -1) {
        const [op] = history.splice(idx, 1);
        undone.push(op);
        redrawAll();
      }
    });

    s.on('redoBroadcast', (op) => {
      if (op) {
        history.push(op);
        const idx = undone.findIndex(o => o.id === op.id);
        if (idx !== -1) undone.splice(idx, 1);
        drawStrokeLocal(op);
      }
    });

    s.on('clearBroadcast', () => {
      history.length = 0;
      undone.length = 0;
      redrawAll();
    });

    s.on('cursor', (data) => {
      const { userId, x, y, name, color: userColor } = data;
      if (!userId || userId === s.id) return;
      let el = cursors[userId];
      if (!el) {
        el = document.createElement('div');
        el.className = 'cursor';
        el.style.background = userColor || '#333';
        el.style.color = '#fff';
        el.style.padding = '2px 6px';
        el.style.borderRadius = '4px';
        el.style.position = 'absolute';
        if (cursorsContainer) cursorsContainer.appendChild(el);
        cursors[userId] = el;
      }
      el.textContent = name || 'someone';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });

    s.on('userLeft', (userId) => {
      if (cursors[userId]) {
        cursors[userId].remove();
        delete cursors[userId];
      }
    });
  }

  // Input capture (pointer events)
  function toCanvasCoords(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top
    };
  }

  // throttle sending cursor positions: rAF-based
  let pendingCursor = null;
  function sendCursor(x, y) {
    pendingCursor = { x, y };
  }
  function cursorTick() {
    if (pendingCursor && socket && typeof socket.emit === 'function') {
      // ClientApp may not exist — guard it
      const name = (window.ClientApp && window.ClientApp.name) ? window.ClientApp.name : undefined;
      const col = (window.ClientApp && window.ClientApp.color) ? window.ClientApp.color : undefined;
      socket.emit('cursor', { x: pendingCursor.x, y: pendingCursor.y, name, color: col });
      pendingCursor = null;
    }
    requestAnimationFrame(cursorTick);
  }

  // batch point sending: accumulate points locally, send on rAF when available
  let pendingPoints = null;
  function pointsTick() {
    if (pendingPoints && localStroke && socket && typeof socket.emit === 'function') {
      socket.emit('strokePoint', { id: localStroke.id, points: pendingPoints });
      localStroke.points.push(...pendingPoints);
      pendingPoints = null;
    }
    requestAnimationFrame(pointsTick);
  }

  // sizing
  function resize() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawAll();
  }

  // Input handlers
  function onPointerDown(ev) {
    if (!(window.ClientApp && window.ClientApp.joined)) { alert('Please join first'); return; }
    canvas.setPointerCapture(ev.pointerId);
    isDrawing = true;
    const p = toCanvasCoords(ev);
    localStroke = {
      id: uid(),
      userId: (socket && socket.id) ? socket.id : (socket && typeof socket.id === 'function' ? socket.id() : undefined),
      tool: tool,
      color: color,
      width: Number(width),
      points: [p]
    };
    if (socket && typeof socket.emit === 'function') socket.emit('startStroke', localStroke);
  }

  function onPointerMove(ev) {
    const p = toCanvasCoords(ev);
    sendCursor(p.x, p.y);

    if (!isDrawing || !localStroke) return;
    if (!pendingPoints) pendingPoints = [];
    pendingPoints.push(p);

    // local visual feedback: draw last two points as a short segment
    const s = localStroke;
    if (s.points.length > 0) {
      const last = s.points[s.points.length - 1];
      const temp = { id: 'tmp', userId: s.userId, tool: s.tool, color: s.color, width: s.width, points: [last, p] };
      drawStrokeLocal(temp);
      s.points.push(p);
    } else {
      s.points.push(p);
    }
  }

  function finishStroke() {
    if (!isDrawing || !localStroke) return;
    if (pendingPoints && socket && typeof socket.emit === 'function') {
      socket.emit('strokePoint', { id: localStroke.id, points: pendingPoints });
      localStroke.points.push(...pendingPoints);
      pendingPoints = null;
    }
    if (socket && typeof socket.emit === 'function') socket.emit('endStroke', localStroke.id);
    // push local to history tentatively? you previously didn't — server will broadcast authoritative op
    localStroke = null;
    isDrawing = false;
  }

  // Expose set options and controls for main.js
  function exposeApi() {
    window.CanvasController = {
      setTool: (t) => { tool = t; },
      setColor: (c) => { color = c; },
      setWidth: (w) => { width = w; },
      undo: () => { if (socket) socket.emit('undo'); },
      redo: () => { if (socket) socket.emit('redo'); },
      clear: () => { if (socket) socket.emit('clear'); },
      getHistory: () => history
    };
  }

  // Initialize once DOM is ready
  function init() {
    // pick up shared globals from page
    socket = window.SocketClient || socket;
    canvas = document.getElementById('canvas');
    cursorsContainer = document.getElementById('cursors');

    if (!canvas) {
      console.error('Canvas element with id="canvas" not found.');
      return;
    }

    ctx = canvas.getContext('2d');

    // set initial size and hook resize
    resize();
    window.addEventListener('resize', resize);

    // register socket handlers
    registerSocketHandlers(socket);

    // pointer events
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
    canvas.addEventListener('pointerout', finishStroke);

    // start rAF loops
    requestAnimationFrame(cursorTick);
    requestAnimationFrame(pointsTick);

    // expose API for main.js
    exposeApi();
  }

  // Wait for DOM ready before initializing
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // small timeout to ensure other scripts (SocketClient, ClientApp) have run
    setTimeout(init, 0);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  }

})();

function pushOp(roomState, op) {
  roomState.history.push(op);
  roomState.undone.length = 0;
}

function undoOp(roomState) {
  if (roomState.history.length === 0) return null;
  const op = roomState.history.pop();
  roomState.undone.push(op);
  return op;
}

function redoOp(roomState) {
  if (roomState.undone.length === 0) return null;
  const op = roomState.undone.pop();
  roomState.history.push(op);
  return op;
}

function clear(roomState) {
  roomState.history.length = 0;
  roomState.undone.length = 0;
}

module.exports = { pushOp, undoOp, redoOp, clear };

const rooms = {};

function getRoom(name) {
  if (!rooms[name]) {
    rooms[name] = {
      users: {},
      history: [],
      undone: []
    };
  }
  return rooms[name];
}

module.exports = { getRoom };

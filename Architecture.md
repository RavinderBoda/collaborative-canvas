# ARCHITECTURE.md

## Overview
This project is a real-time collaborative drawing application. Multiple users can draw together on a shared canvas and see updates instantly.  
The frontend uses vanilla JavaScript and the HTML5 Canvas API. The backend uses Node.js with Socket.IO for real-time communication.

The server maintains the full drawing history and ensures all clients stay synchronized.

---

## System Components

### 1. Client
The client is responsible for:
- Capturing mouse and pointer events
- Drawing strokes immediately for smooth interaction
- Sending drawing data to the server in small batches
- Rendering strokes received from the server
- Showing other users' cursor positions
- Managing undo and redo based on server commands

The client keeps a local copy of the drawing history sent by the server.

### 2. Server
The server handles:
- Managing online users (names, colors, IDs)
- Storing all finalized strokes in a `history` array
- Storing undone strokes in an `undone` array for redo
- Broadcasting incoming strokes to all clients
- Ensuring that all clients see the same canvas
- Handling undo, redo, and clear operations globally

The server is the final authority for the canvas state.

---

## Data Flow

### Drawing
1. User starts drawing → client sends `startStroke`.
2. User moves pointer → client sends batched `strokePoint` updates.
3. User finishes drawing → client sends `finalizeStroke`.
4. Server saves the finalized stroke.
5. Server broadcasts the stroke to all clients.
6. All clients draw the stroke on the canvas.

### Undo
1. Client sends `undo`.
2. Server removes the last stroke from `history` and moves it to `undone`.
3. Server broadcasts `undoBroadcast`.
4. Clients remove the stroke locally and redraw the canvas.

### Redo
1. Client sends `redo`.
2. Server restores the stroke from `undone` to `history`.
3. Server broadcasts `redoBroadcast`.
4. Clients draw the restored stroke.

### Cursor Updates
Clients frequently send their cursor position.  
The server rebroadcasts this so all clients can see other users' cursors.

---

## Stroke Data Structure

A stroke looks like this:

```json
{
  "id": "unique-id",
  "userId": "socket-id",
  "tool": "brush",
  "color": "#000000",
  "width": 4,
  "points": [
    { "x": 10, "y": 20 },
    { "x": 12, "y": 22 }
  ],
  "timestamp": 1680000000000
}

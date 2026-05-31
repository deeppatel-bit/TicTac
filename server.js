const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve main page for room invite links (client will parse room code from URL)
app.get('/join/:roomCode', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory room state storage
// roomCode -> RoomState
const rooms = new Map();

// Global mapping of socket ID -> { roomCode, playerName } for quick disconnect handling
const socketToPlayerMap = new Map();

// Active cleanup timeouts for rooms: roomCode -> timeoutObject
const cleanupTimeouts = new Map();

const WINNING_COMBINATIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

// Generate a random 6-character room code (e.g. T3X9A2)
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Check for collision
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

// Check if a player has won
function checkWin(board) {
  for (const combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: combo };
    }
  }
  return null;
}

// Check if game is a draw
function checkDraw(board) {
  return board.every(cell => cell !== null);
}

// Helper to broadcast room state to everyone in that room
function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // We strip sensitive socket IDs or map them to clean info if needed, but for simplicity
  // we can broadcast the main room state. Socket.io IDs are fine to send or we can just send names.
  io.to(roomCode).emit('gameStateUpdate', {
    roomCode: room.roomCode,
    players: room.players.map(p => ({ name: p.name, symbol: p.symbol, connected: p.connected })),
    spectators: room.spectators.map(s => ({ name: s.name })),
    board: room.board,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    winningLine: room.winningLine,
    chatHistory: room.chatHistory
  });
}

// Add system message to chat history
function addSystemMessage(room, text) {
  const msg = {
    sender: 'System',
    text: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    system: true
  };
  room.chatHistory.push(msg);
  // Keep history reasonable (e.g., last 100 messages)
  if (room.chatHistory.length > 100) {
    room.chatHistory.shift();
  }
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. CREATE ROOM
  socket.on('createRoom', ({ playerName }) => {
    if (!playerName || playerName.trim() === '') {
      return socket.emit('errorMsg', 'Please enter a valid player name.');
    }

    const roomCode = generateRoomCode();
    const formattedName = playerName.trim();

    const room = {
      roomCode,
      players: [
        { id: socket.id, name: formattedName, symbol: 'X', connected: true }
      ],
      spectators: [],
      board: Array(9).fill(null),
      turn: 'X', // X always starts
      status: 'waiting', // waiting, playing, ended
      winner: null,
      winningLine: null,
      chatHistory: [],
      restartRequests: new Set()
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socketToPlayerMap.set(socket.id, { roomCode, playerName: formattedName, role: 'player' });

    addSystemMessage(room, `${formattedName} created the room.`);
    socket.emit('roomCreated', { roomCode, symbol: 'X' });
    broadcastRoomState(roomCode);
    console.log(`Room created: ${roomCode} by ${formattedName}`);
  });

  // 2. JOIN ROOM
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    if (!roomCode || !playerName || playerName.trim() === '') {
      return socket.emit('errorMsg', 'Invalid room code or player name.');
    }

    const upperCode = roomCode.trim().toUpperCase();
    const formattedName = playerName.trim();
    const room = rooms.get(upperCode);

    if (!room) {
      return socket.emit('errorMsg', 'Room not found. Please check the code.');
    }

    // Cancel any pending cleanup timeout for this room
    if (cleanupTimeouts.has(upperCode)) {
      clearTimeout(cleanupTimeouts.get(upperCode));
      cleanupTimeouts.delete(upperCode);
    }

    // Check if player is reconnecting (same name, disconnected)
    const disconnectedPlayer = room.players.find(p => p.name.toLowerCase() === formattedName.toLowerCase() && !p.connected);

    if (disconnectedPlayer) {
      // Reconnect the player
      disconnectedPlayer.id = socket.id;
      disconnectedPlayer.connected = true;
      socket.join(upperCode);
      socketToPlayerMap.set(socket.id, { roomCode: upperCode, playerName: formattedName, role: 'player' });

      addSystemMessage(room, `${formattedName} reconnected.`);
      socket.emit('roomJoined', { roomCode: upperCode, symbol: disconnectedPlayer.symbol, name: formattedName });
      broadcastRoomState(upperCode);
      console.log(`Player ${formattedName} reconnected to room ${upperCode}`);
      return;
    }

    // Check if player name is already taken by an active player in the room
    const isNameTaken = room.players.some(p => p.name.toLowerCase() === formattedName.toLowerCase() && p.connected) ||
      room.spectators.some(s => s.name.toLowerCase() === formattedName.toLowerCase());

    if (isNameTaken) {
      return socket.emit('errorMsg', 'That name is already in use in this room.');
    }

    // Add as player if room is not full (less than 2 players)
    if (room.players.length < 2) {
      const symbol = room.players.length === 0 ? 'X' : (room.players[0].symbol === 'X' ? 'O' : 'X');
      room.players.push({ id: socket.id, name: formattedName, symbol, connected: true });
      socket.join(upperCode);
      socketToPlayerMap.set(socket.id, { roomCode: upperCode, playerName: formattedName, role: 'player' });

      addSystemMessage(room, `${formattedName} joined the room as Player ${symbol}.`);

      // If we now have 2 players, start the game
      if (room.players.length === 2 && room.status === 'waiting') {
        room.status = 'playing';
        addSystemMessage(room, `Game started! It's X's turn.`);
      }

      socket.emit('roomJoined', { roomCode: upperCode, symbol, name: formattedName });
      broadcastRoomState(upperCode);
      console.log(`Room joined: ${upperCode} by player ${formattedName} (${symbol})`);
    } else {
      // Add as spectator
      room.spectators.push({ id: socket.id, name: formattedName });
      socket.join(upperCode);
      socketToPlayerMap.set(socket.id, { roomCode: upperCode, playerName: formattedName, role: 'spectator' });

      addSystemMessage(room, `${formattedName} joined as a spectator.`);
      socket.emit('roomJoined', { roomCode: upperCode, symbol: 'spectator', name: formattedName });
      broadcastRoomState(upperCode);
      console.log(`Room joined: ${upperCode} by spectator ${formattedName}`);
    }
  });

  // 3. MAKE MOVE
  socket.on('makeMove', ({ cellIndex }) => {
    const playerInfo = socketToPlayerMap.get(socket.id);
    if (!playerInfo || playerInfo.role !== 'player') return;

    const { roomCode, playerName } = playerInfo;
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;

    // Find the player object
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Security check: Verify is it this player's turn?
    if (room.turn !== player.symbol) {
      return socket.emit('errorMsg', "It's not your turn!");
    }

    // Security check: Verify cell index boundaries & empty cell
    if (cellIndex < 0 || cellIndex > 8 || room.board[cellIndex] !== null) {
      return socket.emit('errorMsg', "Invalid move!");
    }

    // Apply move
    room.board[cellIndex] = player.symbol;

    // Check for win
    const winResult = checkWin(room.board);
    if (winResult) {
      room.status = 'ended';
      room.winner = winResult.winner;
      room.winningLine = winResult.line;
      const winnerName = room.players.find(p => p.symbol === winResult.winner)?.name || winResult.winner;
      addSystemMessage(room, `${winnerName} wins the game! 🎉`);
    } else if (checkDraw(room.board)) {
      room.status = 'ended';
      room.winner = 'draw';
      addSystemMessage(room, `It's a draw! 🤝`);
    } else {
      // Switch turn
      room.turn = room.turn === 'X' ? 'O' : 'X';
    }

    broadcastRoomState(roomCode);
  });

  // 4. SEND MESSAGE
  socket.on('sendMessage', ({ text }) => {
    const playerInfo = socketToPlayerMap.get(socket.id);
    if (!playerInfo) return;

    const { roomCode, playerName } = playerInfo;
    const room = rooms.get(roomCode);
    if (!room) return;

    if (!text || text.trim() === '') return;

    const msg = {
      sender: playerName,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      system: false
    };

    room.chatHistory.push(msg);
    if (room.chatHistory.length > 100) {
      room.chatHistory.shift();
    }

    broadcastRoomState(roomCode);
  });

  // 5. REQUEST RESTART
  socket.on('requestRestart', () => {
    const playerInfo = socketToPlayerMap.get(socket.id);
    if (!playerInfo || playerInfo.role !== 'player') return;

    const { roomCode, playerName } = playerInfo;
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'ended') return;

    // Add player request
    room.restartRequests.add(socket.id);

    const activePlayers = room.players.filter(p => p.connected);
    const requiredAgreements = Math.min(2, activePlayers.length);

    addSystemMessage(room, `${playerName} voted to restart the game. (${room.restartRequests.size}/${requiredAgreements})`);

    // If all connected players agree to restart
    const allAgreed = activePlayers.every(p => room.restartRequests.has(p.id));

    if (allAgreed && room.restartRequests.size >= requiredAgreements) {
      // Reset game board and status
      room.board = Array(9).fill(null);
      room.status = 'playing';
      room.winner = null;
      room.winningLine = null;
      room.restartRequests.clear();

      // Alternate starting player to keep it fair (winner of previous or swap starting)
      // For simplicity, alternating from the last turn or just default back to X
      room.turn = 'X';

      addSystemMessage(room, `Game restarted! It's X's turn.`);
    }

    broadcastRoomState(roomCode);
  });

  // 6. DISCONNECT
  socket.on('disconnect', () => {
    const playerInfo = socketToPlayerMap.get(socket.id);
    if (!playerInfo) return;

    const { roomCode, playerName, role } = playerInfo;
    const room = rooms.get(roomCode);
    socketToPlayerMap.delete(socket.id);

    if (!room) return;

    if (role === 'player') {
      // Find player
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.connected = false;
        addSystemMessage(room, `${playerName} disconnected. Waiting 30s to reconnect...`);
        broadcastRoomState(roomCode);

        // Start a 30s cleanup timeout
        const timeoutId = setTimeout(() => {
          console.log(`Cleanup room ${roomCode} after player timeout.`);

          // Remove the disconnected player permanently or end the game
          const index = room.players.indexOf(player);
          if (index > -1) {
            room.players.splice(index, 1);
          }

          addSystemMessage(room, `${playerName} failed to reconnect in time.`);

          // If no connected players left, delete room
          const activePlayers = room.players.filter(p => p.connected);
          if (activePlayers.length === 0) {
            rooms.delete(roomCode);
            cleanupTimeouts.delete(roomCode);
            console.log(`Room ${roomCode} deleted due to no active players.`);
          } else {
            // End the game if it was active and declare remaining player as winner
            if (room.status === 'playing') {
              room.status = 'ended';
              const remainingPlayer = activePlayers[0];
              room.winner = remainingPlayer.symbol;
              addSystemMessage(room, `${remainingPlayer.name} wins by forfeit!`);
            }
            broadcastRoomState(roomCode);
          }
        }, 30000);

        cleanupTimeouts.set(roomCode, timeoutId);
      }
    } else {
      // Spectator disconnected
      const index = room.spectators.findIndex(s => s.id === socket.id);
      if (index > -1) {
        room.spectators.splice(index, 1);
        addSystemMessage(room, `${playerName} (spectator) left.`);
        broadcastRoomState(roomCode);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

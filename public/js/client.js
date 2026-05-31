// Connect to the socket server
const socket = io();

// Client State
let myRoomCode = null;
let mySymbol = null; // 'X', 'O', or 'spectator'
let myName = null;
let chatMessagesList = [];
let gameStatus = null;
let isMakingMove = false;
let celebrated = false;

// DOM Elements - Navigation & Views
const homeView = document.getElementById('home-view');
const gameView = document.getElementById('game-view');

// DOM Elements - Inputs
const playerNameInput = document.getElementById('playerNameInput');
const roomCodeInput = document.getElementById('roomCodeInput');

// DOM Elements - Buttons
const btnCreateRoom = document.getElementById('btnCreateRoom');
const btnJoinRoom = document.getElementById('btnJoinRoom');
const btnLeaveGame = document.getElementById('btnLeaveGame');
const btnRestartGame = document.getElementById('btnRestartGame');
const roomCodeValue = document.getElementById('roomCodeValue');
const btnCopyInvite = document.getElementById('btnCopyInvite');
const btnShareInvite = document.getElementById('btnShareInvite');
const inviteLinkValue = document.getElementById('inviteLinkValue');

// DOM Elements - Game Board
const boardGrid = document.getElementById('boardGrid');
const cells = document.querySelectorAll('.cell');

// DOM Elements - Status & Indicators
const playerCardX = document.getElementById('playerCardX');
const playerCardO = document.getElementById('playerCardO');
const playerNameX = document.getElementById('playerNameX');
const playerNameO = document.getElementById('playerNameO');
const playerStatusX = document.getElementById('playerStatusX');
const playerStatusO = document.getElementById('playerStatusO');
const spectatorBadge = document.getElementById('spectatorBadge');
const turnIndicator = document.getElementById('turnIndicator');
const turnText = document.getElementById('turnText');

// DOM Elements - Chat
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

// DOM Elements - Overlay
const gameOverlay = document.getElementById('gameOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const btnOverlayLeave = document.getElementById('btnOverlayLeave');
const btnOverlayRestart = document.getElementById('btnOverlayRestart');

// DOM Elements - Toast
const toast = document.getElementById('toast');

// SVG Templates for X and O symbols
const SVG_X = `
  <svg class="symbol-svg symbol-svg-x" viewBox="0 0 100 100" aria-label="X">
    <line class="svg-x-line-1" x1="22" y1="22" x2="78" y2="78" />
    <line class="svg-x-line-2" x1="78" y1="22" x2="22" y2="78" />
  </svg>
`;

const SVG_O = `
  <svg class="symbol-svg symbol-svg-o" viewBox="0 0 100 100" aria-label="O">
    <circle class="svg-o-circle" cx="50" cy="50" r="38" />
  </svg>
`;

// Show message Toast
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Switch between views
function showView(viewToShow) {
  // Fade out current views
  [homeView, gameView].forEach(v => {
    if (v.classList.contains('active')) {
      v.style.opacity = 0;
      v.style.transform = 'translateY(15px)';
    }
  });

  setTimeout(() => {
    [homeView, gameView].forEach(v => {
      v.classList.remove('active');
      v.style.display = 'none';
    });

    viewToShow.style.display = 'flex';
    // Small timeout for browser to process display change before class transition
    setTimeout(() => {
      viewToShow.classList.add('active');
      viewToShow.style.opacity = 1;
      viewToShow.style.transform = 'translateY(0)';
    }, 50);
  }, 350);
}

// ----------------------------------------------------
// EVENT LISTENERS: DOM Input & Buttons
// ----------------------------------------------------

// Create Room Clicked
btnCreateRoom.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    playerNameInput.focus();
    return showToast('Please enter your name first.');
  }
  myName = name;
  socket.emit('createRoom', { playerName: name });
});

// Join Room Clicked
btnJoinRoom.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim();

  if (!name) {
    playerNameInput.focus();
    return showToast('Please enter your name first.');
  }
  if (!code || code.length !== 6) {
    roomCodeInput.focus();
    return showToast('Please enter a valid 6-character room code.');
  }

  myName = name;
  socket.emit('joinRoom', { roomCode: code, playerName: name });
});

// Copy Room Code Clicked
const copyRoomCode = () => {
  if (myRoomCode) {
    navigator.clipboard.writeText(myRoomCode)
      .then(() => showToast('Room code copied to clipboard!'))
      .catch(() => showToast('Failed to copy. Code: ' + myRoomCode));
  }
};
roomCodeValue.addEventListener('click', copyRoomCode);

// Copy Invite Link Clicked
const copyInviteLink = () => {
  if (myRoomCode) {
    const inviteUrl = `${window.location.origin}/join/${myRoomCode}`;
    navigator.clipboard.writeText(inviteUrl)
      .then(() => showToast('Invite link copied to clipboard!'))
      .catch(() => showToast('Failed to copy invite link.'));
  }
};
btnCopyInvite.addEventListener('click', copyInviteLink);
inviteLinkValue.addEventListener('click', copyInviteLink);

// Share Invite Clicked
btnShareInvite.addEventListener('click', () => {
  if (myRoomCode && navigator.share) {
    const inviteUrl = `${window.location.origin}/join/${myRoomCode}`;
    navigator.share({
      title: 'Join my TicTacNeon Game!',
      text: `Play Tic Tac Toe with me in room ${myRoomCode}!`,
      url: inviteUrl
    }).catch(err => console.log('Share failed:', err));
  }
});

// Auto-fill room code from URL invite links on load
window.addEventListener('DOMContentLoaded', () => {
  const match = window.location.pathname.match(/\/join\/([A-Z0-9]{6})/i);
  if (match) {
    const code = match[1].toUpperCase();
    roomCodeInput.value = code;
    playerNameInput.focus();
    showToast(`Invite Code ${code} loaded! Enter your nickname.`);
  }
});

// Grid Cell Clicked
cells.forEach(cell => {
  cell.addEventListener('click', (e) => {
    if (mySymbol === 'spectator') return; // Spectators cannot play
    if (cell.classList.contains('disabled')) return;
    if (isMakingMove) return;

    // Verify it is our turn locally to prevent spam
    const isMyTurn = (gameStatus === 'playing') && (
      (mySymbol === 'X' && playerCardX.classList.contains('active-turn')) ||
      (mySymbol === 'O' && playerCardO.classList.contains('active-turn'))
    );
    if (!isMyTurn) return;

    const index = parseInt(cell.getAttribute('data-index'), 10);
    isMakingMove = true;
    socket.emit('makeMove', { cellIndex: index });
  });
});

// Submit Chat Message
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  socket.emit('sendMessage', { text });
  chatInput.value = '';
  chatInput.focus();
});

// Request Restart Game
const requestRestart = () => {
  socket.emit('requestRestart');
  showToast('Restart vote submitted!');
};
btnRestartGame.addEventListener('click', requestRestart);
btnOverlayRestart.addEventListener('click', () => {
  requestRestart();
  gameOverlay.classList.remove('active');
});

// Leave Game
const leaveGame = () => {
  // Simple page refresh is the cleanest way to disconnect and reset variables
  window.location.reload();
};
btnLeaveGame.addEventListener('click', leaveGame);
btnOverlayLeave.addEventListener('click', leaveGame);


// ----------------------------------------------------
// SOCKET LISTENERS
// ----------------------------------------------------

function updateInviteLink(roomCode) {
  const inviteUrl = `${window.location.origin}/join/${roomCode}`;
  inviteLinkValue.textContent = inviteUrl;
  if (navigator.share) {
    btnShareInvite.style.display = 'inline-flex';
  } else {
    btnShareInvite.style.display = 'none';
  }
}

socket.on('roomCreated', ({ roomCode, symbol }) => {
  myRoomCode = roomCode;
  mySymbol = symbol;
  roomCodeValue.textContent = roomCode;
  updateInviteLink(roomCode);
  spectatorBadge.style.display = 'none';
  showView(gameView);
  showToast('Room created successfully!');
});

socket.on('roomJoined', ({ roomCode, symbol, name }) => {
  myRoomCode = roomCode;
  mySymbol = symbol;
  roomCodeValue.textContent = roomCode;
  updateInviteLink(roomCode);
  
  if (symbol === 'spectator') {
    spectatorBadge.style.display = 'inline-flex';
    btnRestartGame.style.display = 'none';
  } else {
    spectatorBadge.style.display = 'none';
  }

  showView(gameView);
  showToast(`Joined as ${symbol === 'spectator' ? 'spectator' : 'Player ' + symbol}`);
});

socket.on('errorMsg', (msg) => {
  showToast(msg);
});

socket.on('gameStateUpdate', (state) => {
  // Sync core game variables
  myRoomCode = state.roomCode;
  gameStatus = state.status;
  isMakingMove = false; // Reset move lock

  // 1. UPDATE PLAYERS STATE VISUALLY
  const playerX = state.players.find(p => p.symbol === 'X');
  const playerO = state.players.find(p => p.symbol === 'O');

  if (playerX) {
    playerNameX.textContent = playerX.name;
    playerCardX.style.opacity = '1';
    
    if (playerX.connected) {
      playerStatusX.innerHTML = '<span class="status-dot online"></span> Online';
    } else {
      playerStatusX.innerHTML = '<span class="status-dot"></span> Offline';
    }
  } else {
    playerNameX.textContent = 'Waiting...';
    playerStatusX.innerHTML = '<span class="status-dot"></span> Empty';
  }

  if (playerO) {
    playerNameO.textContent = playerO.name;
    playerCardO.style.opacity = '1';

    if (playerO.connected) {
      playerStatusO.innerHTML = '<span class="status-dot online"></span> Online';
    } else {
      playerStatusO.innerHTML = '<span class="status-dot"></span> Offline';
    }
  } else {
    playerNameO.textContent = 'Waiting...';
    playerStatusO.innerHTML = '<span class="status-dot"></span> Empty';
  }

  // Highlight whose turn it is
  playerCardX.classList.remove('active-turn');
  playerCardO.classList.remove('active-turn');
  
  turnIndicator.className = 'turn-indicator';
  if (state.status === 'playing') {
    if (state.turn === 'X') {
      playerCardX.classList.add('active-turn');
      turnIndicator.classList.add('turn-x');
      turnText.textContent = state.turn === mySymbol ? "Your Turn (X)" : `${playerX ? playerX.name : 'X'}'s Turn`;
    } else if (state.turn === 'O') {
      playerCardO.classList.add('active-turn');
      turnIndicator.classList.add('turn-o');
      turnText.textContent = state.turn === mySymbol ? "Your Turn (O)" : `${playerO ? playerO.name : 'O'}'s Turn`;
    }
  } else if (state.status === 'waiting') {
    turnText.textContent = 'Waiting for Players...';
  } else if (state.status === 'ended') {
    if (state.winner === 'draw') {
      turnText.textContent = "It's a Draw! 🤝";
    } else {
      const winnerPlayer = state.players.find(p => p.symbol === state.winner);
      const winnerName = winnerPlayer ? winnerPlayer.name : state.winner;
      turnText.textContent = `${winnerName} Wins! 👑`;
      if (state.winner === 'X') {
        turnIndicator.classList.add('turn-x');
      } else {
        turnIndicator.classList.add('turn-o');
      }
    }
  }

  // 2. RENDER THE GAME BOARD CELLS
  state.board.forEach((val, idx) => {
    const cell = cells[idx];
    
    // Check if cell content needs update to avoid re-triggering animations unnecessarily
    const currentSVG = cell.querySelector('.symbol-svg');
    const isOccupied = val !== null;
    
    if (!isOccupied) {
      cell.innerHTML = '';
      cell.classList.remove('disabled', 'winner-cell');
      if (mySymbol === 'spectator') {
        cell.classList.add('disabled');
      }
    } else {
      cell.classList.add('disabled');
      
      // Inject SVG symbol only if it wasn't already rendered
      if (!currentSVG) {
        cell.innerHTML = val === 'X' ? SVG_X : SVG_O;
      }

      // Check if this cell is part of the winning line
      if (state.winningLine && state.winningLine.includes(idx)) {
        cell.classList.add('winner-cell');
      } else {
        cell.classList.remove('winner-cell');
      }
    }
  });

  // Show/Hide Restart Button based on game state and role
  if (state.status === 'ended' && mySymbol !== 'spectator') {
    btnRestartGame.style.display = 'inline-flex';
  } else {
    btnRestartGame.style.display = 'none';
  }

  // 3. RENDER SYSTEM AND USER MESSAGES
  renderChat(state.chatHistory);

  // Trigger winner celebration confetti once
  if (state.status === 'ended') {
    if (!celebrated) {
      if (state.winner !== 'draw') {
        startCelebration();
      }
      celebrated = true;
    }
  } else {
    celebrated = false;
  }

  // 4. PROCESS GAME OVER / OVERLAY DISPLAY
  if (state.status === 'ended') {
    if (state.winner === 'draw') {
      overlayTitle.textContent = "It's a Draw! 🤝";
      overlayTitle.className = "overlay-title draw";
      overlayText.textContent = "Great match! No cells remaining.";
    } else {
      const winnerPlayer = state.players.find(p => p.symbol === state.winner);
      const winnerName = winnerPlayer ? winnerPlayer.name : state.winner;

      if (mySymbol === state.winner) {
        overlayTitle.textContent = "Victory! 🏆";
        overlayTitle.className = "overlay-title win";
        overlayText.textContent = `Excellent job! You defeated ${mySymbol === 'X' ? (playerO?.name || 'O') : (playerX?.name || 'X')}.`;
      } else if (mySymbol === 'spectator') {
        overlayTitle.textContent = `${winnerName} Wins! 👑`;
        overlayTitle.className = "overlay-title draw";
        overlayText.textContent = `Player ${state.winner} has won the match.`;
      } else {
        overlayTitle.textContent = "Defeat 💔";
        overlayTitle.className = "overlay-title lost";
        overlayText.textContent = `Better luck next time! ${winnerName} won this match.`;
      }
    }

    // Spectators can't play again, hide the Play Again button
    if (mySymbol === 'spectator') {
      btnOverlayRestart.style.display = 'none';
    } else {
      btnOverlayRestart.style.display = 'inline-flex';
    }

    gameOverlay.classList.add('active');
  } else {
    gameOverlay.classList.remove('active');
  }
});

// Render the entire chat list from server state history
function renderChat(chatHistory) {
  // Check if we have new messages or count change to minimize redraw lag
  if (chatHistory.length === chatMessagesList.length && 
      JSON.stringify(chatHistory) === JSON.stringify(chatMessagesList)) {
    return;
  }
  
  chatMessagesList = chatHistory;
  chatMessages.innerHTML = '';

  chatHistory.forEach(msg => {
    const msgDiv = document.createElement('div');
    
    if (msg.system) {
      msgDiv.className = 'message system';
      msgDiv.innerHTML = `<span>${msg.text}</span>`;
    } else {
      // Determine if self or opponent sent it
      const isSelf = msg.sender.toLowerCase() === myName.toLowerCase();
      msgDiv.className = `message ${isSelf ? 'sent' : 'received'}`;
      
      const displayName = isSelf ? 'You' : msg.sender;
      msgDiv.innerHTML = `
        <span class="msg-sender">${displayName}</span>
        <span class="msg-content">${escapeHTML(msg.text)}</span>
        <span class="msg-time">${msg.timestamp}</span>
      `;
    }
    chatMessages.appendChild(msgDiv);
  });

  // Auto scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Secure helper to escape HTML inside user chat texts to prevent XSS
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ----------------------------------------------------
// NEON CONFETTI CELEBRATION
// ----------------------------------------------------
const canvas = document.getElementById('celebration-canvas');
const ctx = canvas.getContext('2d');
let animationFrameId = null;
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 6 + 5;
    this.speedX = Math.random() * 10 - 5;
    this.speedY = Math.random() * -12 - 6; // upward speed
    this.gravity = 0.25;
    this.color = color;
    this.opacity = 1;
    this.decay = Math.random() * 0.015 + 0.008;
    this.spin = Math.random() * 360;
    this.spinSpeed = Math.random() * 8 - 4;
  }

  update() {
    this.x += this.speedX;
    this.speedY += this.gravity;
    this.y += this.speedY;
    this.opacity -= this.decay;
    this.spin += this.spinSpeed;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin * Math.PI / 180);
    ctx.globalAlpha = this.opacity;
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

function spawnConfetti() {
  const colors = ['#00f2fe', '#ff0844', '#39ff14', '#ffff00', '#7928ca'];
  // Left side launch
  for (let i = 0; i < 60; i++) {
    particles.push(new Particle(0, canvas.height, colors[Math.floor(Math.random() * colors.length)]));
  }
  // Right side launch
  for (let i = 0; i < 60; i++) {
    particles.push(new Particle(canvas.width, canvas.height, colors[Math.floor(Math.random() * colors.length)]));
  }
  // Center burst
  for (let i = 0; i < 40; i++) {
    particles.push(new Particle(canvas.width / 2, canvas.height / 2, colors[Math.floor(Math.random() * colors.length)]));
  }
}

function animateCelebration() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    if (p.opacity <= 0) {
      particles.splice(i, 1);
    } else {
      p.draw();
    }
  }

  if (particles.length > 0) {
    animationFrameId = requestAnimationFrame(animateCelebration);
  } else {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function startCelebration() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    particles = [];
  }
  spawnConfetti();
  animateCelebration();
}

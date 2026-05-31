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
let isFirstStateUpdate = true;

// Sound Manager for synthesized Web Audio API sound effects
const SoundManager = {
  ctx: null,
  isMuted: false,

  init() {
    const savedMuted = localStorage.getItem('sound_muted');
    if (savedMuted !== null) {
      this.isMuted = savedMuted === 'true';
    } else {
      this.isMuted = false;
    }
    this.updateToggleButton();
  },

  toggle() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('sound_muted', this.isMuted);
    this.updateToggleButton();
    
    // Play a brief click sound when turning sounds ON to confirm audibility
    if (!this.isMuted) {
      this.playClick();
    }
  },

  updateToggleButton() {
    const btn = document.getElementById('soundToggleBtn');
    if (!btn) return;
    
    if (this.isMuted) {
      btn.classList.add('muted');
      btn.title = "Unmute Sounds";
      btn.setAttribute('aria-label', 'Unmute Sounds');
      btn.innerHTML = `
        <svg class="sound-icon-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      `;
    } else {
      btn.classList.remove('muted');
      btn.title = "Mute Sounds";
      btn.setAttribute('aria-label', 'Mute Sounds');
      btn.innerHTML = `
        <svg class="sound-icon-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      `;
    }
  },

  ensureContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  // Soft click sound when placing X or O (fast pitch/amplitude ramp)
  playClick() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  },

  // Soft modern chime sound for incoming chat messages (two offset sine waves)
  playChatNotification() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    // Note 1 (E5): starting immediately
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.06, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // Note 2 (A5): starting 0.08s later
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.08);
    gain2.gain.setValueAtTime(0.06, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.29);
  },

  // Triumphant winner celebration (C5 -> E5 -> G5 -> C6 major arpeggio with subtle slide/vibrato)
  playWinnerCelebration() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const delays = [0, 0.08, 0.16, 0.24];
    
    notes.forEach((freq, idx) => {
      const startTime = now + delays[idx];
      const duration = idx === 3 ? 0.65 : 0.22;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      if (idx === 3) {
        osc.frequency.exponentialRampToValueAtTime(1055, startTime + 0.3);
      }
      
      gain.gain.setValueAtTime(0.07, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    });
  },

  // Futuristic digital descending chime/reset sound
  playRestart() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    // Wave 1
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(600, now);
    osc1.frequency.exponentialRampToValueAtTime(300, now + 0.22);
    
    gain1.gain.setValueAtTime(0.0, now);
    gain1.gain.linearRampToValueAtTime(0.1, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.23);

    // Wave 2
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(450, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(225, now + 0.3);
    
    gain2.gain.setValueAtTime(0.0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.07, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    
    osc2.start(now + 0.08);
    osc2.stop(now + 0.31);
  }
};

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

// Auto-fill room code from URL invite links on load and trigger simplified join screen
window.addEventListener('DOMContentLoaded', () => {
  const match = window.location.pathname.match(/\/join\/([A-Z0-9]{6})/i);
  if (match) {
    const code = match[1].toUpperCase();
    roomCodeInput.value = code;
    roomCodeInput.readOnly = true;
    roomCodeInput.classList.add('readonly-field');
    
    // Enable invite-mode layout styling (hides create action & divider, styles join button as primary)
    homeView.classList.add('invite-mode');
    
    // Update subtitle to highlight the room code invitation
    const subtitle = homeView.querySelector('.subtitle');
    if (subtitle) {
      subtitle.innerHTML = `You have been invited to join room <span class="highlight-code">${code}</span>`;
    }
    
    // Change join button text and style for invite context
    btnJoinRoom.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3" />
      </svg>
      Join Active Game
    `;
    
    playerNameInput.focus();
    showToast(`Invite to room ${code} loaded!`);
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

// Sound Toggle Click and Initialization
document.getElementById('soundToggleBtn').addEventListener('click', () => {
  SoundManager.ensureContext();
  SoundManager.toggle();
});

// Resume AudioContext on any interaction for modern browser autoplay policies
['click', 'touchstart', 'keydown'].forEach(eventType => {
  document.addEventListener(eventType, () => {
    SoundManager.ensureContext();
  }, { passive: true });
});

// Initialize sound preference
SoundManager.init();


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
  if (name) myName = name;
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
  const oldStatus = gameStatus;
  // Sync core game variables
  myRoomCode = state.roomCode;
  gameStatus = state.status;
  isMakingMove = false; // Reset move lock

  // Play subtle game restart sound if transition from ended to playing
  const isRestart = (oldStatus === 'ended' && gameStatus === 'playing');
  if (isRestart) {
    SoundManager.playRestart();
  }

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
  let cellPlaced = false;
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
        if (!isFirstStateUpdate) {
          cellPlaced = true;
        }
      }

      // Check if this cell is part of the winning line
      if (state.winningLine && state.winningLine.includes(idx)) {
        cell.classList.add('winner-cell');
      } else {
        cell.classList.remove('winner-cell');
      }
    }
  });

  if (cellPlaced) {
    SoundManager.playClick();
  }

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
        SoundManager.playWinnerCelebration();
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

  isFirstStateUpdate = false;
});

// Render the entire chat list from server state history
function renderChat(chatHistory) {
  // Check if we have new messages or count change to minimize redraw lag
  if (chatHistory.length === chatMessagesList.length && 
      JSON.stringify(chatHistory) === JSON.stringify(chatMessagesList)) {
    return;
  }
  
  // Play sound for incoming message from another user if already in room
  if (chatMessagesList.length > 0 && chatHistory.length > chatMessagesList.length) {
    for (let i = chatMessagesList.length; i < chatHistory.length; i++) {
      const msg = chatHistory[i];
      if (!msg.system && myName && msg.sender.toLowerCase() !== myName.toLowerCase()) {
        SoundManager.playChatNotification();
        break;
      }
    }
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

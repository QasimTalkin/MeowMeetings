const { ipcRenderer } = require('electron');

// DOM elements
const container = document.getElementById('cat-walk-container');
const catSvg = document.querySelector('.cat-svg');
const bannerCard = document.querySelector('.banner-card');
const glowEffect = document.querySelector('.banner-glow-effect');

const txtTitle = document.getElementById('meeting-title');
const txtOrganizer = document.getElementById('meeting-organizer');
const txtCountdown = document.getElementById('countdown-timer');

const btnJoin = document.getElementById('btn-join');
const btnSnooze = document.getElementById('btn-snooze');
const btnDismiss = document.getElementById('btn-dismiss');

const soundMeow = document.getElementById('sound-meow');
const soundPurr = document.getElementById('sound-purr');

let meetingData = null;
let currentSettings = null;
let soundVolume = 0.5;
let countdownInterval = null;

function init() {
  // Bind visual hover events to control window transparency dynamically
  bindHoverTransparency(bannerCard);
  bindHoverTransparency(catSvg);

  // Mouse moves create custom lighting glow on glassmorphic card
  bannerCard.addEventListener('mousemove', (e) => {
    const rect = bannerCard.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    bannerCard.style.setProperty('--mouse-x', `${x}px`);
    bannerCard.style.setProperty('--mouse-y', `${y}px`);
  });

  // Action clicks
  btnJoin.addEventListener('click', handleJoin);
  btnSnooze.addEventListener('click', handleSnooze);
  btnDismiss.addEventListener('click', handleRunAway);

  // Petting the cat meow trigger
  catSvg.addEventListener('click', playPetSound);

  // Safety trigger: close overlay once cat exits screen completely
  container.addEventListener('animationend', (e) => {
    if (e.animationName === 'transitScreen' || e.animationName === 'transitScreenFast') {
      if (countdownInterval) clearInterval(countdownInterval);
      ipcRenderer.send('close-overlay');
    }
  });
}

// Receive visual alert context
ipcRenderer.on('init-walk', (event, data) => {
  meetingData = data.meeting;
  currentSettings = data.settings;

  // Set text labels
  txtTitle.innerText = meetingData.title;
  txtOrganizer.innerText = meetingData.organizer ? `with ${meetingData.organizer}` : meetingData.timeLabel;
  
  // Hide join button if no link exists
  if (!meetingData.link) {
    btnJoin.style.display = 'none';
  }

  // Setup sound volumes
  if (currentSettings.soundVolume === 'muted') {
    soundVolume = 0;
  } else if (currentSettings.soundVolume === 'soft') {
    soundVolume = 0.22;
  } else {
    soundVolume = 0.65;
  }

  // Apply visual settings (breed & speed)
  container.className = `cat-walk-container breed-${currentSettings.breed} speed-${currentSettings.speed} walking`;

  // Live countdown ticker (secondsLeft from main process)
  startCountdown(meetingData.secondsLeft ?? 0);

  // Play meow greeting on screen entry
  setTimeout(playGreetingSound, 600);
});

// Update meeting data if overlay is already open
ipcRenderer.on('update-meeting', (event, data) => {
  meetingData = data;
  txtTitle.innerText = meetingData.title;
  txtOrganizer.innerText = meetingData.organizer ? `with ${meetingData.organizer}` : meetingData.timeLabel;
  if (!meetingData.link) btnJoin.style.display = 'none';
  else btnJoin.style.display = '';
  startCountdown(meetingData.secondsLeft ?? 0);
});

// Live countdown ticker (initialSeconds is raw seconds)
function startCountdown(initialSeconds) {
  if (countdownInterval) clearInterval(countdownInterval);

  let secondsLeft = initialSeconds;

  function tick() {
    if (secondsLeft <= 0) {
      txtCountdown.innerText = 'Starting now!';
      txtCountdown.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      clearInterval(countdownInterval);
      return;
    }
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    if (mins > 0) {
      txtCountdown.innerText = secs === 0 ? `in ${mins}m` : `in ${mins}m ${secs}s`;
    } else {
      txtCountdown.innerText = `in ${secs}s`;
      txtCountdown.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    }
    secondsLeft--;
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

// Dynamic click-through toggle on hover
function bindHoverTransparency(element) {
  element.addEventListener('mouseenter', () => {
    ipcRenderer.send('set-ignore-mouse', false); // Capture mouse events (make clickable)
  });

  element.addEventListener('mouseleave', () => {
    ipcRenderer.send('set-ignore-mouse', true); // Release mouse events (make click-through)
  });
}

// Meow soft greeting
function playGreetingSound() {
  if (soundVolume === 0) return;
  soundMeow.volume = soundVolume;
  soundMeow.play().catch(err => console.log('Audio playback blocked:', err));
}

// Purr soft response
function playPetSound() {
  if (soundVolume === 0) return;
  
  // Wiggle head on pet
  const head = document.querySelector('.cat-head');
  head.style.transform = 'rotate(-10deg) scale(1.05)';
  
  soundPurr.volume = soundVolume;
  soundPurr.play().catch(err => console.log('Audio playback blocked:', err));

  setTimeout(() => {
    head.style.transform = 'none';
  }, 400);
}

// Handle Dismiss / Run away off-screen left
function handleRunAway() {
  const currentX = container.getBoundingClientRect().left;
  container.style.setProperty('--current-x', `${currentX}px`);

  // Release focus so window becomes click-through
  ipcRenderer.send('set-ignore-mouse', true);

  // Transition to high velocity running state
  container.classList.remove('walking');
  container.className = `cat-walk-container breed-${currentSettings.breed} running`;
}

// Join meeting and run away
function handleJoin() {
  if (meetingData.link) {
    ipcRenderer.send('open-link', meetingData.link);
  }
  handleRunAway();
}

// Snooze and run away
function handleSnooze() {
  ipcRenderer.send('snooze-meeting', meetingData);
  handleRunAway();
}

document.addEventListener('DOMContentLoaded', init);

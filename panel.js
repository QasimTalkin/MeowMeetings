const { ipcRenderer } = require('electron');

// DOM elements
const meetingsView = document.getElementById('meetings-view');
const settingsView = document.getElementById('settings-view');

const btnToSettings = document.getElementById('btn-to-settings');
const btnBack = document.getElementById('btn-back');

const icalUrlInput = document.getElementById('ical-url');
const catBreedSelect = document.getElementById('cat-breed');
const catSpeedSelect = document.getElementById('cat-speed');
const triggerTimeSelect = document.getElementById('trigger-time');
const soundVolumeSelect = document.getElementById('sound-volume');

const btnSave = document.getElementById('btn-save');
const btnTestWalk = document.getElementById('btn-test-walk');
const btnForceSync = document.getElementById('btn-force-sync');

const eventsList = document.getElementById('events-list');
const noMeetings = document.getElementById('no-meetings');
const syncText = document.getElementById('sync-text');
const syncIndicator = document.querySelector('.status-indicator');

const helpTrigger = document.getElementById('help-trigger');
const helpClose = document.getElementById('help-close');
const helpDrawer = document.getElementById('help-drawer');

// Load configurations on initialization
let currentSettings = ipcRenderer.sendSync('get-settings');

function init() {
  populateSettingsForm(currentSettings);
  
  // Set view toggle events
  btnToSettings.addEventListener('click', () => {
    meetingsView.classList.remove('active');
    settingsView.classList.add('active');
  });

  btnBack.addEventListener('click', () => {
    settingsView.classList.remove('active');
    meetingsView.classList.add('active');
    // Force sync when returning
    ipcRenderer.send('force-sync');
  });

  // Save Settings Click Handler
  btnSave.addEventListener('click', () => {
    const updated = {
      icalUrl: icalUrlInput.value.trim(),
      breed: catBreedSelect.value,
      speed: catSpeedSelect.value,
      triggerTime: parseInt(triggerTimeSelect.value, 10),
      soundVolume: soundVolumeSelect.value
    };

    btnSave.innerText = 'Saving...';
    btnSave.disabled = true;

    ipcRenderer.send('save-settings', updated);
  });

  // Test Walk Handler
  btnTestWalk.addEventListener('click', () => {
    ipcRenderer.send('trigger-test-walk');
  });

  // Force Sync Handler
  btnForceSync.addEventListener('click', () => {
    syncText.innerText = 'Syncing...';
    syncIndicator.className = 'status-indicator';
    btnForceSync.disabled = true;
    ipcRenderer.send('force-sync');
  });

  // Help Drawers Handlers
  helpTrigger.addEventListener('click', () => {
    helpDrawer.classList.remove('hidden');
    requestAnimationFrame(() => helpDrawer.classList.add('active'));
  });

  helpClose.addEventListener('click', () => {
    helpDrawer.classList.remove('active');
    setTimeout(() => helpDrawer.classList.add('hidden'), 320);
  });

  // Request initial sync
  if (currentSettings.icalUrl) {
    ipcRenderer.send('force-sync');
  } else {
    showSetupNotice();
  }
}

// Populate Settings View
function populateSettingsForm(data) {
  icalUrlInput.value = data.icalUrl || '';
  catBreedSelect.value = data.breed || 'tabby';
  catSpeedSelect.value = data.speed || 'normal';
  triggerTimeSelect.value = data.triggerTime !== undefined ? data.triggerTime.toString() : '300';
  soundVolumeSelect.value = data.soundVolume || 'normal';
}

// Settings Save Finished Handler
ipcRenderer.on('settings-saved', (event, savedSettings) => {
  currentSettings = savedSettings;
  btnSave.innerText = 'Save Changes';
  btnSave.disabled = false;
  
  // Transition back to meetings overview
  settingsView.classList.remove('active');
  meetingsView.classList.add('active');

  // Trigger sync on new credentials
  if (currentSettings.icalUrl) {
    ipcRenderer.send('force-sync');
  } else {
    showSetupNotice();
  }
});

// Setup Notice if calendar URL is missing
function showSetupNotice() {
  syncText.innerText = 'Calendar not connected';
  syncIndicator.className = 'status-indicator error';
  
  eventsList.innerHTML = '';
  noMeetings.classList.add('hidden');
  
  const setupCard = document.createElement('div');
  setupCard.className = 'event-card';
  setupCard.style.textAlign = 'center';
  setupCard.style.padding = '20px 10px';
  setupCard.innerHTML = `
    <span class="event-time" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; margin: 0 auto 10px auto; width: max-content;">Setup Required</span>
    <p class="event-title" style="margin-bottom: 12px; font-size: 12px;">Paste your private Google Calendar iCal URL in Settings to sync your meetings.</p>
    <button id="btn-go-to-settings" class="card-button join" style="max-width: 150px; margin: 0 auto;">Connect Now</button>
  `;
  eventsList.appendChild(setupCard);

  document.getElementById('btn-go-to-settings').addEventListener('click', () => {
    meetingsView.classList.remove('active');
    settingsView.classList.add('active');
  });
}

// Render dynamic meetings list
function renderMeetings(meetings) {
  eventsList.innerHTML = '';
  
  if (!meetings || meetings.length === 0) {
    noMeetings.classList.remove('hidden');
    return;
  }

  noMeetings.classList.add('hidden');
  const now = new Date();

  meetings.forEach(meeting => {
    const startTime = new Date(meeting.start);
    const endTime = meeting.end ? new Date(meeting.end) : new Date(startTime.getTime() + 30 * 60 * 1000);
    
    const card = document.createElement('div');
    card.className = 'event-card';

    // Metadata area
    const meta = document.createElement('div');
    meta.className = 'event-meta';

    // Format Start time
    const timeLabel = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeBadge = document.createElement('span');
    timeBadge.className = 'event-time';
    timeBadge.innerText = timeLabel;
    meta.appendChild(timeBadge);

    // Dynamic Countdown Badge
    const diffMs = startTime - now;
    const diffMin = Math.round(diffMs / 60000);
    const countdown = document.createElement('span');
    countdown.className = 'event-countdown';

    if (now > endTime) {
      countdown.innerText = 'Ended';
      countdown.style.color = 'var(--text-muted)';
    } else if (now >= startTime && now <= endTime) {
      countdown.innerText = 'In Progress ☕️';
      countdown.style.color = '#ef4444';
    } else if (diffMin === 0) {
      countdown.innerText = 'Starting now!';
      countdown.style.color = '#f59e0b';
    } else if (diffMin < 60) {
      countdown.innerText = `in ${diffMin}m`;
    } else {
      const hours = Math.floor(diffMin / 60);
      countdown.innerText = `in ${hours}h`;
      countdown.style.color = 'var(--text-muted)';
    }
    meta.appendChild(countdown);
    card.appendChild(meta);

    // Title
    const title = document.createElement('div');
    title.className = 'event-title';
    title.innerText = meeting.summary || 'No Title Meeting';
    card.appendChild(title);

    // Host
    const host = document.createElement('div');
    host.className = 'event-host';
    host.innerText = meeting.organizer ? `Organized by: ${meeting.organizer}` : 'No organizer listed';
    card.appendChild(host);

    // Action button
    if (meeting.link) {
      const actions = document.createElement('div');
      actions.className = 'event-actions';

      const joinBtn = document.createElement('button');
      joinBtn.className = 'card-button join';
      joinBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
        Join Video Call
      `;
      joinBtn.addEventListener('click', () => {
        ipcRenderer.send('open-link', meeting.link);
      });
      actions.appendChild(joinBtn);
      card.appendChild(actions);
    }

    eventsList.appendChild(card);
  });
}

// IPC Sync events
ipcRenderer.on('sync-success', (event, meetings) => {
  btnForceSync.disabled = false;
  syncIndicator.className = 'status-indicator synced';
  
  const lastSyncDate = new Date();
  const timeStr = lastSyncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  syncText.innerText = `Synced at ${timeStr}`;

  renderMeetings(meetings);
});

ipcRenderer.on('sync-failed', (event, errorMsg) => {
  btnForceSync.disabled = false;
  syncIndicator.className = 'status-indicator error';
  syncText.innerText = 'Sync failed';
  console.error('ICS Sync failed:', errorMsg);

  eventsList.innerHTML = '';
  noMeetings.classList.add('hidden');

  const errorCard = document.createElement('div');
  errorCard.className = 'event-card';
  errorCard.style.borderColor = 'rgba(239, 68, 68, 0.2)';
  errorCard.innerHTML = `
    <span class="event-time" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; width: max-content;">Sync Error</span>
    <p class="event-title" style="margin-top: 6px; font-size: 12px; color: #fca5a5;">Could not fetch calendar. Please check your iCal URL and internet connection.</p>
    <p class="event-host" style="font-size: 10px; margin-top: 4px;">Detail: ${errorMsg}</p>
  `;
  eventsList.appendChild(errorCard);
});

ipcRenderer.on('refresh-panel', (event, settings) => {
  currentSettings = settings;
  populateSettingsForm(settings);
  if (settings.icalUrl) {
    ipcRenderer.send('force-sync');
  } else {
    showSetupNotice();
  }
});

// Run Init
document.addEventListener('DOMContentLoaded', init);

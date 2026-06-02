const { app, BrowserWindow, Tray, Menu, ipcMain, shell, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows references
let tray = null;
let panelWindow = null;
let overlayWindow = null;

// Settings configuration path
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Default Settings
let settings = {
  icalUrl: '',
  breed: 'tabby', // tabby, calico, tuxedo, siamese, void
  speed: 'normal', // slow, normal, fast
  triggerTime: 300, // seconds before meeting
  soundVolume: 'normal', // muted, soft, normal
  lastSynced: null
};

// Load settings on startup
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = { ...settings, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Save settings helper
function saveSettings(newSettings) {
  try {
    settings = { ...settings, ...newSettings };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    // Notify panel if open
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send('settings-updated', settings);
    }
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

// Make sure only a single instance of the app runs
const additionalData = { myKey: 'meow-meetings-unique-key' };
const gotTheLock = app.requestSingleInstanceLock(additionalData);

if (!gotTheLock) {
  app.quit();
  return;
}

// Initialize Application
app.whenReady().then(() => {
  loadSettings();
  createTray();
  createPanelWindow();
  
  // Start the background calendar check scheduler
  startScheduler();

  // Hide Dock icon on macOS so it runs purely as a background tray app
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
});

// Create macOS System Tray Icon
function createTray() {
  // Load the PNG template icon (Electron requires PNG, not SVG)
  const iconPath = path.join(__dirname, 'assets', 'trayIconTemplate.png');
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    console.warn('PNG icon not found, generating fallback.');
    // Programmatic fallback: generate a minimal PNG in memory
    const zlib = require('zlib');
    const W = 16, H = 16;
    const raw = [];
    for (let y = 0; y < H; y++) {
      raw.push(0);
      for (let x = 0; x < W; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        const on = (dx * dx + dy * dy) <= 36;
        raw.push(0, 0, 0, on ? 255 : 0);
      }
    }
    function crc32(buf) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0); }
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function pngChunk(type, data) {
      const t = Buffer.from(type, 'ascii'), l = Buffer.alloc(4), cr = Buffer.alloc(4);
      l.writeUInt32BE(data.length); cr.writeUInt32BE(crc32(Buffer.concat([t, data])));
      return Buffer.concat([l, t, data, cr]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([
      Buffer.from([137,80,78,71,13,10,26,10]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', zlib.deflateSync(Buffer.from(raw))),
      pngChunk('IEND', Buffer.alloc(0))
    ]);
    trayIcon = nativeImage.createFromBuffer(png);
  }
  trayIcon.setTemplateImage(true);

  tray = new Tray(trayIcon);
  tray.setToolTip('MeowMeetings');

  tray.on('click', () => {
    togglePanel();
  });

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Control Panel', click: togglePanel },
      { type: 'separator' },
      { label: 'Trigger Test Cat Walk', click: triggerTestWalk },
      { type: 'separator' },
      { label: 'Quit MeowMeetings', click: () => app.quit() }
    ]);
    tray.popUpContextMenu(contextMenu);
  });
}

// Create Settings & Calendar control panel window
function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: 320,
    height: 450,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Simpler for our local vanilla HTML app
    }
  });

  panelWindow.loadFile(path.join(__dirname, 'panel.html'));

  // Close panel when it loses focus (behavior matching native macOS popovers)
  panelWindow.on('blur', () => {
    panelWindow.hide();
  });
}

// Toggle the visibility of the control panel
function togglePanel() {
  if (!panelWindow) return;

  if (panelWindow.isVisible()) {
    panelWindow.hide();
  } else {
    positionPanel();
    panelWindow.show();
    panelWindow.focus();
    // Refresh meetings when showing panel
    panelWindow.webContents.send('refresh-panel', settings);
  }
}

// Position panel directly under the tray icon
function positionPanel() {
  const trayBounds = tray.getBounds();
  const panelBounds = panelWindow.getBounds();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  // Calculate centered X position relative to tray icon
  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (panelBounds.width / 2));
  
  // Guard borders
  if (x < 10) x = 10;
  if (x + panelBounds.width > screenWidth - 10) {
    x = screenWidth - panelBounds.width - 10;
  }

  // Y is just below the tray
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  panelWindow.setPosition(x, y);
}

// Create center-screen Cat Walk Overlay Window
function createOverlayWindow(meetingData) {
  // If overlay is already active, ignore or update
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('update-meeting', meetingData);
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

  // Height of overlay to accommodate center walk
  const overlayHeight = 350; 
  const y = Math.round((screenHeight - overlayHeight) / 2);

  overlayWindow = new BrowserWindow({
    x: 0,
    y: y,
    width: screenWidth,
    height: overlayHeight,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Always click through initially
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('init-walk', {
      meeting: meetingData,
      settings: settings
    });
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Start visual test of the walking cat
function triggerTestWalk() {
  const dummyMeeting = {
    title: 'Design Sync & Coffee ☕️',
    organizer: 'Cat Boss',
    timeLabel: '10:30 AM',
    secondsLeft: settings.triggerTime,
    link: 'https://meet.google.com/abc-defg-hij',
    isTest: true
  };
  createOverlayWindow(dummyMeeting);
}

// Scheduler state
let upcomingMeetings = [];
let checkedMeetings = new Set(); // Keep track of already alerted meeting IDs

// Core Sync & Checking Scheduler Loop
function startScheduler() {
  const calendarSync = require('./calendar-sync');

  // Check calendar every 5 minutes
  async function syncCalendar() {
    if (!settings.icalUrl) return;
    try {
      upcomingMeetings = await calendarSync.fetchAndParseICS(settings.icalUrl);
      settings.lastSynced = new Date().toISOString();
      saveSettings(settings);
      
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('sync-success', upcomingMeetings);
      }
    } catch (err) {
      console.error('Calendar sync error:', err);
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('sync-failed', err.message);
      }
    }
  }

  // Periodic meeting alarm monitor (checks every 5 seconds for sub-minute precision)
  function monitorMeetings() {
    if (upcomingMeetings.length === 0) return;

    const now = new Date();
    upcomingMeetings.forEach(meeting => {
      const startTime = new Date(meeting.start);
      const diffMs = startTime - now;
      const diffSec = Math.round(diffMs / 1000);

      // Unique identifier for the meeting at this specific warning time
      const meetingAlertId = `${meeting.uid || meeting.summary}-${startTime.toISOString()}-${settings.triggerTime}`;

      // Fire when seconds-until-meeting falls into the trigger window (±6s tolerance for 5s check interval)
      if (diffSec >= settings.triggerTime && diffSec < settings.triggerTime + 6 && !checkedMeetings.has(meetingAlertId)) {
        checkedMeetings.add(meetingAlertId);
        createOverlayWindow({
          title: meeting.summary,
          organizer: meeting.organizer || 'Google Calendar',
          timeLabel: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          secondsLeft: settings.triggerTime,
          link: meeting.link || '',
          isTest: false
        });
      }
    });
  }

  // Initial fetch and loop triggers
  syncCalendar();
  setInterval(syncCalendar, 5 * 60000);  // 5 minutes sync
  setInterval(monitorMeetings, 5000);     // 5 seconds check (needed for 30s/5s precision)
}

// IPC Receivers (Communication from Renderers)
ipcMain.on('get-settings', (event) => {
  event.returnValue = settings;
});

ipcMain.on('save-settings', (event, newSettings) => {
  saveSettings(newSettings);
  event.reply('settings-saved', settings);
});

ipcMain.on('trigger-test-walk', () => {
  triggerTestWalk();
});

ipcMain.on('open-link', (event, url) => {
  if (url) {
    shell.openExternal(url);
  }
});

// Dynamic click-through handler
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('close-overlay', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
});

ipcMain.on('snooze-meeting', (event, meeting) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  // Reschedule the reminder to trigger in 2 minutes
  const snoozeTime = new Date();
  snoozeTime.setMinutes(snoozeTime.getMinutes() + 2);

  // Inject a mock meeting to trigger in 2 minutes
  const snoozeMeetingAlertId = `${meeting.title}-snoozed-${snoozeTime.toISOString()}`;
  
  upcomingMeetings.push({
    summary: meeting.title,
    organizer: meeting.organizer,
    start: snoozeTime.toISOString(),
    link: meeting.link,
    uid: `snooze-${Date.now()}`
  });
  
  console.log(`Scheduled snoozed meeting reminder in 2 minutes: ${meeting.title}`);
});

ipcMain.on('force-sync', async (event) => {
  const calendarSync = require('./calendar-sync');
  if (!settings.icalUrl) {
    event.reply('sync-failed', 'No iCal URL configured.');
    return;
  }
  try {
    upcomingMeetings = await calendarSync.fetchAndParseICS(settings.icalUrl);
    settings.lastSynced = new Date().toISOString();
    saveSettings(settings);
    event.reply('sync-success', upcomingMeetings);
  } catch (err) {
    event.reply('sync-failed', err.message);
  }
});

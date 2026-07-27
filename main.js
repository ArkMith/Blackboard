const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "Blackboard",
    backgroundColor: "#0f0d0b", // Matches Blackboard's dark theme background (--color-bg)
    autoHideMenuBar: true,      // Keeps the application canvas clean and borderless
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // If in production, load the built static HTML index file framework
  if (process.env.NODE_ENV === 'production') {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  } else {
    // If developing live locally, hook into your active Vite development server pipeline
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools(); // Opens terminal inspect consoles automatically
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

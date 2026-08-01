// Desktop shell for Groundwork Panel. The same local runtime that
// `npm start` uses is embedded here: it polls the vendors and serves the
// dashboard on localhost, and this shell just opens a window onto it.
// Keys behave identically to the CLI version: a config file in the user's
// home directory, never leaving the machine.

import { app, BrowserWindow, Menu, shell } from 'electron';
import { startPanelServer } from './server.mjs';

const PORT = Number(process.env.PANEL_PORT || 7439);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Groundwork Panel',
    autoHideMenuBar: true,
    webPreferences: {
      // The page is our own static build talking to localhost; no Node
      // access from the renderer.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // "Open console" links go to the real browser, not this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`http://localhost:${PORT}`);
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startPanelServer(PORT);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

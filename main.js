'use strict'

const { app, BrowserWindow, dialog, ipcMain } = require('electron')

let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1480,
    height: 990,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  })

  // and load the index.html of the app.
  win.loadFile('index.html')

  // Open the DevTools.
  // win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('path:get', async (_, type) => {
  try {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    
    if (!result.canceled) {
      win.webContents.send('path:selected', {
        path: result.filePaths,
        type,
      })
    }
  }
  catch(err){
    console.error(err)
  }
})
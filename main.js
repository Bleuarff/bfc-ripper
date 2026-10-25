'use strict'

const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const { mkdir, rm } = require('node:fs/promises')
const { exec } = require('child_process')

let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1480,
    height: 990,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, 'img/logo-512.png'),
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
  ipcMain.handle('set-cd', setCd)
  ipcMain.handle('cd-paranoia', cdParanoia)
  ipcMain.handle('mkdir', (e, filepath) => mkdir(filepath, { recursive: true }))
  ipcMain.handle('rm', (e, filepath) => rm(filepath, { recursive: true }))

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

function setCd() {
  return new Promise(resolve => {
    exec('setcd -i', (err, stdout, stderr) => {
      resolve({ err, stdout, stderr })
    })
  })
}

function cdParanoia() {
  return new Promise(resolve => {
     exec('cdparanoia -Q', (err, stdout, stderr) => {
      resolve({ err, stdout, stderr })
     })
  })
}
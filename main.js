'use strict'

// const electron = require('electron')
const { app, BrowserWindow } = require('electron')

let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1480,
    height: 990,
    webPreferences: {
      nodeIntegration: true
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

app.on('ready', createWindow)

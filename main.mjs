import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path  from 'path'
import { mkdir, rm } from 'node:fs/promises'
import { exec, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

let win // browser window
let workDir // tmp directory for WAV extraction
let paranoiaProc // cdParanoia extraction process

const procs = new Map() // table for spawned processes

let nextId = 1

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1480,
    height: 990,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(import.meta.dirname, 'preload.cjs')
    },
    icon: path.join(import.meta.dirname, 'img/logo-512.png'),
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
  ipcMain.handle('get-toc', getTOC)
  ipcMain.handle('mkdir', (e, filepath) => mkdir(filepath, { recursive: true }))
  ipcMain.handle('rm-tmp-dir', rmTmpDir)
  ipcMain.handle('getDir', selectDirectory)
  ipcMain.handle('resolve', pathResolve)
  ipcMain.handle('get-tmp-dir', getTmpDir)
  ipcMain.handle('spawn-rip', spawnRip)
  ipcMain.handle('kill-rip', killRip)
  ipcMain.handle('spawn-flac', runFlac)
  ipcMain.handle('spawn-lame', runLame)

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

function createSendFunction(sender, id){
  return function(canal, ...args) {
    if (!sender.isDestroyed())
      sender.send(canal, id, ...args)
  }
}

function spawnRip(event, args) {
  console.debug('Start rip process:', ...args, workDir)

  const sender = event.sender
  const id = nextId++
  const send = createSendFunction(sender, id)
  
  paranoiaProc = spawn('cdparanoia', args, {cwd: workDir})
  
  paranoiaProc.stderr.setEncoding('utf8')
  paranoiaProc.stderr.on('data', chunk => send('rip:stderr', chunk))
  paranoiaProc.on('error', err => send('rip:error', err.message))
  paranoiaProc.on('close', (code, signal) => {
    send('rip:close', code, signal)
  })

  return id
}

function runFlac(event, cmdArgs){

  const cmd = [
    'flac',
    '-3',
    `-T ARTIST="${cmdArgs.artist}"`,
    `-T TITLE="${cmdArgs.title}"`,
    `-T ALBUM="${cmdArgs.album}"`,
    `-T DATE="${cmdArgs.year}"`,
    `-T TRACKNUMBER="${cmdArgs.pos}"`,
    `-T GENRE="${cmdArgs.genre}"`,
    `-T DISCNUMBER="${cmdArgs.discNumber}"`,
    cmdArgs.imagePath ? `--picture="${cmdArgs.imagePath}"` : '',
    `-o "${cmdArgs.outputFile}"`,
    `"${cmdArgs.inputFile}"`
  ].join(' ')

  console.debug(cmd)

  const sender = event.sender
  const id = nextId++
  const send = createSendFunction(sender, id)
  const proc =  spawn(cmd, [], { shell: true })

  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stdout.on('data', chunk => send('flac:data', chunk))
  proc.stderr.on('data', chunk => send('flac:data', chunk))
  proc.on('close', (code, signal) => {
    send('flac:close', code, signal)
  })

  return id
}

function runLame(event, cmdArgs) {
  const cmd = [
    'lame',
    '-S',
    '-V2',
    '--noreplaygain',
    '--add-id3v2',
    `--ta "${cmdArgs.artist}"`,
    `--tt "${cmdArgs.title}"`,
    `--tl "${cmdArgs.album}"`,
    `--ty "${cmdArgs.year}"`,
    `--tn "${cmdArgs.pos}"`,
    `--tg "${cmdArgs.genre}"`,
    `--tv "TPOS=${cmdArgs.discNumber}"`,
    cmdArgs.imagePath ? `--ti "${cmdArgs.imagePath}"` : '',
    `"${cmdArgs.inputFile}"`,
    `"${cmdArgs.outputFile}"`
  ].join(' ')

  console.log(cmd)
  
  const sender = event.sender
  const id = nextId++
  const send = createSendFunction(sender, id)

  const proc = spawn(cmd, [], { shell: true })

  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stdout.on('data', chunk => send('lame:data', chunk))
  proc.stderr.on('data', chunk => send('lame:data', chunk))
  proc.on('close', (code, signal) => {
    send('lame:close', code, signal)
  })

  return id
}

function killRip(){
  paranoiaProc?.kill('SIGTERM')
}

function getTmpDir() {
  workDir = path.resolve(tmpdir(), 'bfcrip-' + Date.now().toString())
  return workDir
}

async function rmTmpDir() {
  if (workDir) {

    try {
      await rm(workDir, { recursive: true })
      workDir = ''
    }
    catch(ex) {
      console.error(ex)
    }
  }

  return
}

async function selectDirectory() {
  try {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    
    if (!result.canceled) {
      return result.filePaths?.[0]
    }
  }
  catch(err){
    console.error(err)
  }
}

function pathResolve(...args) {
  return path.resolve(...args)
}

function setCd() {
  return new Promise(resolve => {
    exec('setcd -i', (err, stdout, stderr) => {
      resolve({ err, stdout, stderr })
    })
  })
}

function getTOC() {
  console.debug('get TOC')
  return new Promise(resolve => {
     exec('cdparanoia -Q', (err, stdout, stderr) => {
      resolve({ err, stdout, stderr })
     })
  })
}
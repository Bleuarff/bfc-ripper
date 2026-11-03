const { contextBridge, ipcRenderer, webUtils } = require('electron')

function on(canal, id, cb) {
    const handler = (_event, msgId, ...args) => {
        if (msgId === id)
            cb(...args)
    }
    ipcRenderer.on(canal, handler)
    return () => ipcRenderer.removeListener(canal, handler)
}

contextBridge.exposeInMainWorld('bfc', {
    setCD: () => ipcRenderer.invoke('set-cd'),
    getTOC: () => ipcRenderer.invoke('get-toc'),
    mkdir: (filepath) => ipcRenderer.invoke('mkdir', filepath),
    rmTmp: () => ipcRenderer.invoke('rm-tmp-dir'),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    getDirectory: () => ipcRenderer.invoke('getDir'),
    resolve: (...args) => ipcRenderer.invoke('resolve', ...args),
    getTmpDir: () => ipcRenderer.invoke('get-tmp-dir'),

    spawnRip: (args) => ipcRenderer.invoke('spawn-rip', args),
    killRip: () => ipcRenderer.invoke('kill-rip'),
    
    spawnFlac: (cmd) => ipcRenderer.invoke('spawn-flac', cmd),
    onFlacData: (id, cb) => on('flac:data', id, cb),
    onFlacClose: (id, cb) => on('flac:close', id, cb),

    spawnLame: (cmd) => ipcRenderer.invoke('spawn-lame', cmd),
    onLameData: (id, cb) => on('lame:data', id, cb),
    onLameClose: (id, cb) => on('lame:close', id, cb),

    onStderr: (id, cb) => on('rip:stderr', id, cb),
    onError: (id, cb) => on('rip:error', id, cb),
    onClose: (id, cb) => on('rip:close', id, cb),

})
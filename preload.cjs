const { contextBridge, ipcRenderer, webUtils, dialog } = require('electron')

contextBridge.exposeInMainWorld('bfc', {
    setCD: () => ipcRenderer.invoke('set-cd'),
    cdparanoia: () => ipcRenderer.invoke('cd-paranoia'),
    mkdir: (filepath) => ipcRenderer.invoke('mkdir', filepath),
    rm: (filepath) => ipcRenderer.invoke('rm', filepath),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    getDirectory: () => ipcRenderer.invoke('getDir'),
})
import { type IpcRendererEvent } from "electron"

const { contextBridge, ipcRenderer, webUtils } = require('electron')

function on(canal: string, id: Number, cb: Function) {
    const handler = (_event: IpcRendererEvent, msgId: Number, ...args: any[]) => {
        if (msgId === id)
            cb(...args)
    }
    ipcRenderer.on(canal, handler)
    return () => ipcRenderer.removeListener(canal, handler)
}

function on2(canal: string, cb: Function) {
    const handler = (_event: IpcRendererEvent, msgId: Number, ...args: any[]) => {
        cb(msgId, ...args)
    }
    ipcRenderer.on(canal, handler)
    return () => ipcRenderer.removeListener(canal, handler)
}

const bfcApi = {
    setCD: () => ipcRenderer.invoke('set-cd'),
    getTOC: () => ipcRenderer.invoke('get-toc'),
    mkdir: (filepath: string) => ipcRenderer.invoke('mkdir', filepath),
    rmTmp: () => ipcRenderer.invoke('rm-tmp-dir'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    getDirectory: () => ipcRenderer.invoke('getDir'),
    resolve: (...args: string[]) => ipcRenderer.invoke('resolve', ...args),
    getTmpDir: () => ipcRenderer.invoke('get-tmp-dir'),

    spawnRip: (args: string[]) => ipcRenderer.invoke('spawn-rip', args),
    killRip: () => ipcRenderer.invoke('kill-rip'),
    
    spawnFlac: (details: any) => ipcRenderer.invoke('spawn-flac', details),
    onFlacData: (cb: Function) => on2('flac:data', cb),
    onFlacClose: (cb: Function) => on2('flac:close', cb),

    spawnLame: (details: any) => ipcRenderer.invoke('spawn-lame', details),
    onLameData: (cb: Function) => on2('lame:data', cb),
    onLameClose: (cb: Function) => on2('lame:close', cb),

    onStderr: (id: Number, cb: Function) => on('rip:stderr', id, cb),
    onError: (id: Number, cb: Function) => on('rip:error', id, cb),
    onClose: (id: Number, cb: Function) => on('rip:close', id, cb),
}

contextBridge.exposeInMainWorld('bfc', bfcApi)

export type BfcApi = typeof bfcApi
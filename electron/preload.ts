import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    ipcRenderer.on(channel, listener)
  },
  off: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    ipcRenderer.off(channel, listener)
  },
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
})

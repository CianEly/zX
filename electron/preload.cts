const { ipcRenderer, contextBridge } = require('electron')

console.log('Preload script starting (CJS)...')

try {
  contextBridge.exposeInMainWorld('ipcRenderer', {
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (_event: any, ...args: any[]) => listener(...args))
    },
    off: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.off(channel, (_event: any, ...args: any[]) => listener(...args))
    },
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    getApiConfig: () => ipcRenderer.invoke('get-api-config'),
    getSshHosts: () => ipcRenderer.invoke('get-ssh-hosts'),
    connectSsh: (params: { host: string; tunnelPort: number }) => ipcRenderer.invoke('connect-ssh', params),
    spawnLocalBackend: () => ipcRenderer.invoke('spawn-local-backend'),
    onConnectionProgress: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('connection-progress', listener)
      return () => ipcRenderer.off('connection-progress', listener) // Return uninstaller
    }
  })
  console.log('IPC Bridge exposed successfully')
} catch (e) {
  console.error('Failed to expose IPC Bridge:', e)
}

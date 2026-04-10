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
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    addRecentProject: (params: { path: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('add-recent-project', params),
    initProject: (params: { path: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('init-project', params),
    listHooks: (projectPath: string, env: 'local' | 'remote') => ipcRenderer.invoke('list-hooks', { projectPath, env }),
    readHook: (projectPath: string, filename: string, env: 'local' | 'remote') => ipcRenderer.invoke('read-hook', { projectPath, filename, env }),
    writeHook: (projectPath: string, filename: string, content: string, env: 'local' | 'remote') => ipcRenderer.invoke('write-hook', { projectPath, filename, content, env }),
    listData: (params: { projectPath: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('list-data', params),
    readData: (params: { projectPath: string; filename: string, env: 'local' | 'remote' }) => ipcRenderer.invoke('read-data', params),
    writeData: (params: { projectPath: string; filename: string, content: string, env: 'local' | 'remote' }) => ipcRenderer.invoke('write-data', params),
    importData: (params: { projectPath: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('import-data', params),
    disconnect: () => ipcRenderer.invoke('disconnect'),
    connectSsh: (params: { host: string; tunnelPort: number; user?: string; password?: string; identityFile?: string }) => ipcRenderer.invoke('connect-ssh', params),
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

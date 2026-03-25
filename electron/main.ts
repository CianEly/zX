import type { BrowserWindow as BrowserWindowType } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const _dirname = fileURLToPath(new URL('.', import.meta.url))

// We use a dynamic import or the global to get app/BrowserWindow
// But for ESM, static import *should* work if we fix the bundler.
// Let's try to use the global 'require' if it's there as a last resort.
const electron = await import('electron')
const { app, BrowserWindow } = electron.default || electron

let mainWindow: BrowserWindowType | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(_dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  if (!mainWindow) return

  // Set the background color to match zX theme
  mainWindow.setBackgroundColor('#0A0B0F')

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(_dirname, '../dist/index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    mainWindow = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)

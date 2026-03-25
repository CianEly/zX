import { app, BrowserWindow, ipcMain } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import * as net from 'node:net'
import SSHConfig from 'ssh-config'
import { Client } from 'ssh2'

const _dirname = dirname(fileURLToPath(import.meta.url))
const username = userInfo().username

async function getSSHConfigForHost(hostAlias: string) {
  const configPath = join(homedir(), '.ssh', 'config')
  try {
    await access(configPath, constants.R_OK)
    const content = await readFile(configPath, 'utf8')
    const config = SSHConfig.parse(content)
    const resolved = config.compute(hostAlias) as any
    return {
      host: (resolved.HostName as string) || hostAlias,
      user: (resolved.User as string) || username,
      port: parseInt((resolved.Port as string) || '22'),
      // IdentityFile can be a string or array of strings in ssh-config
      identityFile: Array.isArray(resolved.IdentityFile) ? resolved.IdentityFile[0] : (resolved.IdentityFile as string)
    }
  } catch {
    return { host: hostAlias, user: username, port: 22 }
  }
}

let mainWindow: BrowserWindowType | null = null
let backendProcess: ChildProcess | null = null
let sshClient: Client | null = null
let tunnelServer: net.Server | null = null

const API_PORT = process.env.ZX_PORT || '8000'
const API_TOKEN = randomBytes(32).toString('hex')

// Handle API config request from frontend
ipcMain.handle('get-api-config', () => {
  return { port: API_PORT, token: API_TOKEN }
})

// Handle local backend spawning from frontend
ipcMain.handle('spawn-local-backend', async () => {
  try {
    spawnBackend()
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
})

// Handle SSH host discovery
ipcMain.handle('get-ssh-hosts', async () => {
  try {
    const configPath = join(homedir(), '.ssh', 'config')
    try {
      await access(configPath, constants.R_OK)
    } catch {
      return [] // File doesn't exist or is not readable
    }
    
    const content = await readFile(configPath, 'utf8')
    const config = SSHConfig.parse(content)
    
    return config
      .filter((line: any) => line.type === SSHConfig.DIRECTIVE && line.param === 'Host')
      .map((line: any) => line.value)
      .filter((host: string) => host !== '*' && !host.includes('?'))
  } catch (e) {
    console.error('Error reading SSH config:', e)
    return []
  }
})

// Local Backend Spawning
function spawnBackend() {
  const backendDir = join(_dirname, '..', 'backend')
  const uvPath = join(homedir(), '.local/bin/uv')
  
  console.log('Spawning local backend...')
  backendProcess = spawn(uvPath, ['run', 'zx-backend', '--port', API_PORT], {
    cwd: backendDir,
    env: {
      ...process.env,
      ZX_API_TOKEN: API_TOKEN,
      ZX_PORT: API_PORT,
      PYTHONUNBUFFERED: '1'
    }
  })

  backendProcess.stdout?.on('data', (data) => console.log(`[Backend]: ${data}`))
  backendProcess.stderr?.on('data', (data) => {
    const msg = data.toString()
    console.error(`[Backend Error]: ${msg}`)
    if (msg.includes('address already in use')) {
      mainWindow?.webContents.send('connection-progress', { 
        step: 1, 
        status: 'error', 
        sub: `Port ${API_PORT} in use. Kill existing process or use ZX_PORT.` 
      })
    }
  })
  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`)
    if (code !== 0 && code !== null) {
      mainWindow?.webContents.send('connection-progress', { 
        step: 0, 
        status: 'error', 
        sub: `Backend exited with code ${code}` 
      })
    }
  })
}

// Remote SSH Connection & Bootstrapping
ipcMain.handle('connect-ssh', async (event, { host: hostAlias, tunnelPort }) => {
  if (sshClient) sshClient.end()
  if (tunnelServer) tunnelServer.close()
  
  const config = await getSSHConfigForHost(hostAlias)
  sshClient = new Client()
  
  return new Promise((resolve, reject) => {
    sshClient!.on('ready', () => {
      console.log(`SSH Client Ready: ${config.user}@${config.host}`)
      setupRemoteEnvironment(sshClient!, tunnelPort)
        .then(() => resolve({ success: true }))
        .catch(err => reject(err))
    }).on('error', (err) => {
      console.error('SSH Connection Error:', err)
      reject(err)
    }).connect({
      host: config.host,
      port: config.port,
      username: config.user,
      agent: process.env.SSH_AUTH_SOCK,
    })
  })
})

async function setupRemoteEnvironment(conn: Client, localPort: number) {
  const sendProgress = (step: number, status: string, sub?: string) => {
    mainWindow?.webContents.send('connection-progress', { step, status, sub })
  }

  try {
    sendProgress(1, 'active', 'ssh handshake')
    // 1. Bootstrap uv
    sendProgress(2, 'active', 'installing uv...')
    await executeRemote(conn, 'curl -LsSf https://astral.sh/uv/install.sh | sh')
    sendProgress(2, 'done', 'uv installed')
    
    // 2. Create directory
    await executeRemote(conn, 'mkdir -p ~/.zx/backend')
    
    // 3. SFTP the wheel
    sendProgress(3, 'active', 'deploying backend wheel...')
    const localWheel = join(_dirname, '..', 'backend', 'dist', 'zx_backend-0.1.0-py3-none-any.whl')
    await uploadFile(conn, localWheel, '.zx/backend/zx_backend.whl')
    sendProgress(3, 'done', 'backend deployed')
    
    // 4. Install wheel into venv
    sendProgress(4, 'active', 'setting up python venv...')
    await executeRemote(conn, '~/.local/bin/uv venv ~/.zx/python')
    await executeRemote(conn, '~/.local/bin/uv pip install ~/.zx/backend/zx_backend.whl --python ~/.zx/python/bin/python')
    sendProgress(4, 'done', 'venv ready')
    
    // 5. Start backend on remote
    sendProgress(5, 'active', 'starting remote server...')
    const remoteCmd = `ZX_API_TOKEN=${API_TOKEN} ZX_PORT=8000 ~/.zx/python/bin/python -m zx.main`
    conn.exec(remoteCmd, (err, stream) => {
      if (err) console.error('Error starting remote backend:', err)
      stream.on('data', (data: any) => console.log(`[Remote Backend]: ${data}`))
    })

    // 6. Setup Tunnel
    sendProgress(4, 'active', `tunneling localhost:${localPort} ↔ 8000`)
    tunnelServer = net.createServer((sock) => {
      conn.forwardOut(sock.remoteAddress!, sock.remotePort!, '127.0.0.1', 8000, (err, stream) => {
        if (err) return sock.end()
        sock.pipe(stream).pipe(sock)
      })
    }).listen(localPort, '127.0.0.1')
    sendProgress(4, 'done', 'tunnel established')
    sendProgress(5, 'done', 'remote backend ready')

  } catch (err) {
    sendProgress(0, 'error', (err as Error).message)
    throw err
  }
}

function executeRemote(conn: Client, cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      stream.on('close', () => resolve())
            .on('data', (data: any) => console.log(`[SSH STDOUT]: ${data}`))
            .stderr.on('data', (data: any) => console.error(`[SSH STDERR]: ${data}`))
    })
  })
}

function uploadFile(conn: Client, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })
}

function createWindow() {
  const preloadPath = join(_dirname, 'preload.cjs')
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  if (!mainWindow) return
  
  mainWindow.setBackgroundColor('#0A0B0F')
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(_dirname, '../dist/index.html'))
  }
}

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (sshClient) sshClient.end()
  if (tunnelServer) tunnelServer.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  if (backendProcess) backendProcess.kill()
  if (sshClient) sshClient.end()
  if (tunnelServer) tunnelServer.close()
})

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  createWindow()
})

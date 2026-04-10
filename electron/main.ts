import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, access, writeFile, mkdir, readdir } from 'node:fs/promises'
import { hookTemplates } from './templates'
import { constants } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import * as net from 'node:net'
import SSHConfig from 'ssh-config'
import { Client } from 'ssh2'

let currentTunnelPort: number | null = null

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
  return {
    port: currentTunnelPort || API_PORT,
    token: API_TOKEN
  }
})

ipcMain.handle('disconnect', async () => {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
  if (sshClient) {
    sshClient.end()
    sshClient = null
  }
  if (tunnelServer) {
    tunnelServer.close()
    tunnelServer = null
  }
  currentTunnelPort = null
  return { success: true }
})

// Handle local backend spawning from frontend
ipcMain.handle('spawn-local-backend', async (event) => {
  try {
    currentTunnelPort = null // Reset tunnel port so frontend falls back to API_PORT
    spawnBackend()
    
    // Wait for the backend to be healthy
    let attempts = 0
    let success = false
    while (attempts < 10) {
      try {
        const res = await fetch(`http://127.0.0.1:${API_PORT}/health`, {
          headers: { Authorization: `Bearer ${API_TOKEN}` }
        })
        if (res.ok) {
          success = true
          break
        }
      } catch {}
      attempts++
      await new Promise(res => setTimeout(res, 500))
    }

    if (!success) {
      return { success: false, error: 'Backend failed to start or health check timed out' }
    }
    
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

ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  return { canceled, filePaths }
})

// Handle recent projects
ipcMain.handle('get-recent-projects', async () => {
  const settingsPath = join(app.getPath('userData'), 'recent-projects.json')
  try {
    const content = await readFile(settingsPath, 'utf8')
    let projects = JSON.parse(content)
    if (Array.isArray(projects) && projects.length > 0 && typeof projects[0] === 'string') {
      return projects.map(p => ({ path: p, env: 'local' }))
    }
    return projects
  } catch {
    return []
  }
})

ipcMain.handle('add-recent-project', async (event, { path, env }: { path: string, env: 'local' | 'remote' }) => {
  const settingsPath = join(app.getPath('userData'), 'recent-projects.json')
  let projects: { path: string, env: 'local' | 'remote' }[] = []
  try {
    const content = await readFile(settingsPath, 'utf8')
    projects = JSON.parse(content)
    // Basic migration if it was a flat array
    if (projects.length > 0 && typeof projects[0] === 'string') {
      projects = (projects as any).map((p: string) => ({ path: p, env: 'local' }))
    }
  } catch {}
  projects = [{ path, env }, ...projects.filter(p => p.path !== path)].slice(0, 10)
  await writeFile(settingsPath, JSON.stringify(projects))
  return projects
})

ipcMain.handle('init-project', async (event, { path: projectPath, env }: { path: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      await mkdir(expandedPath, { recursive: true })
      await mkdir(join(expandedPath, 'hooks'), { recursive: true })
      await mkdir(join(expandedPath, 'data'), { recursive: true })
      
      for (const [filename, content] of Object.entries(hookTemplates)) {
        try { await access(join(expandedPath, 'hooks', filename), constants.R_OK) } 
        catch { await writeFile(join(expandedPath, 'hooks', filename), content) }
      }
      return { success: true }
    } else {
      if (!sshClient) throw new Error('No active SSH connection')
      await executeRemote(sshClient, `mkdir -p ${projectPath}/hooks ${projectPath}/data`)
      const tempPath = join(app.getPath('userData'), 'temp_hooks')
      await mkdir(tempPath, { recursive: true })
      
      for (const [filename, content] of Object.entries(hookTemplates)) {
        const remoteFile = `${projectPath}/hooks/${filename}`
        // Check if file exists before overwriting
        const exists = await new Promise<boolean>((resolve) => {
          sshClient!.exec(`[ -f ${remoteFile} ] && echo "exists"`, (err, stream) => {
            if (err) return resolve(false)
            let out = ''
            stream.on('data', (d) => out += d.toString())
            stream.on('close', () => resolve(out.includes('exists')))
          })
        })

        if (!exists) {
          console.log(`[init-project] Scaffolding missing hook: ${remoteFile}`)
          const localT = join(tempPath, filename)
          await writeFile(localT, content)
          await uploadFile(sshClient, localT, remoteFile).catch(() => null)
        }
      }
      return { success: true }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('list-hooks', async (event, { projectPath, env }: { projectPath: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      const files = await readdir(join(expandedPath, 'hooks'))
      return files.filter(f => f.endsWith('.py'))
    } else {
      if (!sshClient) return []
      return new Promise((resolve) => {
        sshClient!.exec(`ls ${projectPath}/hooks/*.py`, (err, stream) => {
          if (err) return resolve([])
          let data = ''
          stream.on('data', (d: any) => data += d.toString())
          stream.on('close', () => {
            const files = data.trim().split('\n').map(f => f.split('/').pop()!).filter(f => f)
            resolve(files)
          })
        })
      })
    }
  } catch { return [] }
})

ipcMain.handle('read-hook', async (event, { projectPath, filename, env }: { projectPath: string, filename: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      return await readFile(join(expandedPath, 'hooks', filename), 'utf8')
    } else {
      if (!sshClient) throw new Error('No SSH connection')
      return new Promise((resolve, reject) => {
        sshClient!.exec(`cat ${projectPath}/hooks/${filename}`, (err, stream) => {
          if (err) return reject(err)
          let data = ''
          stream.on('data', (d: any) => data += d.toString())
          stream.on('close', () => resolve(data))
        })
      })
    }
  } catch (e: any) { return `# Error reading hook: ${e.message}` }
})

ipcMain.handle('write-hook', async (event, { projectPath, filename, content, env }: { projectPath: string, filename: string, content: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      await writeFile(join(expandedPath, 'hooks', filename), content)
      return { success: true }
    } else {
      if (!sshClient) throw new Error('No SSH connection')
      console.log(`[write-hook] Remote save attempt: ${projectPath}/hooks/${filename}`)
      const tempT = join(app.getPath('userData'), `temp_${filename}`)
      await writeFile(tempT, content)
      
      let remoteTarget = `${projectPath}/hooks/${filename}`
      if (remoteTarget.startsWith('~/')) {
        remoteTarget = remoteTarget.slice(2)
      }

      console.log(`[write-hook] SFTP upload to: ${remoteTarget}`)
      await uploadFile(sshClient, tempT, remoteTarget)
      console.log(`[write-hook] Success: ${remoteTarget}`)
      return { success: true }
    }
  } catch (e: any) { 
    console.error('[write-hook] ERROR:', e)
    return { success: false, error: e.message } 
  }
})

ipcMain.handle('list-data', async (event, { projectPath, env }: { projectPath: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      const files = await readdir(join(expandedPath, 'data'))
      return files.filter(f => f.endsWith('.csv'))
    } else {
      if (!sshClient) return []
      return new Promise((resolve) => {
        sshClient!.exec(`ls ${projectPath}/data/*.csv`, (err, stream) => {
          if (err) return resolve([])
          let data = ''
          stream.on('data', (d: any) => data += d.toString())
          stream.on('close', () => {
            const files = data.trim().split('\n').map(f => f.split('/').pop()!).filter(f => f)
            resolve(files)
          })
        })
      })
    }
  } catch { return [] }
})

ipcMain.handle('read-data', async (event, { projectPath, filename, env }: { projectPath: string, filename: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      return await readFile(join(expandedPath, 'data', filename), 'utf8')
    } else {
      if (!sshClient) throw new Error('No SSH connection')
      return new Promise((resolve, reject) => {
        sshClient!.exec(`cat ${projectPath}/data/${filename}`, (err, stream) => {
          if (err) return reject(err)
          let data = ''
          stream.on('data', (d: any) => data += d.toString())
          stream.on('close', () => resolve(data))
        })
      })
    }
  } catch (e: any) { return `# Error reading data: ${e.message}` }
})

ipcMain.handle('write-data', async (event, { projectPath, filename, content, env }: { projectPath: string, filename: string, content: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      await writeFile(join(expandedPath, 'data', filename), content)
      return { success: true }
    } else {
      if (!sshClient) throw new Error('No SSH connection')
      const tempT = join(app.getPath('userData'), `temp_${filename}`)
      await writeFile(tempT, content)
      
      let remoteTarget = `${projectPath}/data/${filename}`
      if (remoteTarget.startsWith('~/')) {
        remoteTarget = remoteTarget.slice(2)
      }
      await uploadFile(sshClient, tempT, remoteTarget)
      return { success: true }
    }
  } catch (e: any) { 
    return { success: false, error: e.message } 
  }
})

ipcMain.handle('import-data', async (event, { projectPath, env }: { projectPath: string, env: 'local' | 'remote' }) => {
  try {
    console.log(`[import-data] Opening dialog for project: ${projectPath}`)
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    
    if (canceled || filePaths.length === 0) {
      console.log('[import-data] Dialog canceled')
      return { success: false, error: 'Canceled' }
    }
    
    const sourcePath = filePaths[0]
    const filename = sourcePath.split(/[\\/]/).pop()!
    console.log(`[import-data] Importing: ${filename} from ${sourcePath}`)
    const content = await readFile(sourcePath, 'utf8')
    
    if (env === 'local') {
      const expandedPath = projectPath.startsWith('~/') ? join(homedir(), projectPath.slice(2)) : projectPath
      await writeFile(join(expandedPath, 'data', filename), content)
    } else {
      if (!sshClient) throw new Error('No SSH connection')
      const tempT = join(app.getPath('userData'), `temp_${filename}`)
      await writeFile(tempT, content)
      
      let remoteTarget = `${projectPath}/data/${filename}`
      if (remoteTarget.startsWith('~/')) {
        remoteTarget = remoteTarget.slice(2)
      }
      await uploadFile(sshClient, tempT, remoteTarget)
    }
    
    console.log(`[import-data] Successfully imported: ${filename}`)
    return { success: true, filename }
  } catch (e: any) {
    console.error('[import-data] ERROR:', e)
    return { success: false, error: e.message }
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
ipcMain.handle('connect-ssh', async (event, { host: hostAlias, tunnelPort, user, password, identityFile }) => {


  if (sshClient) sshClient.end()
  if (tunnelServer) tunnelServer.close()

  currentTunnelPort = tunnelPort
  const config = await getSSHConfigForHost(hostAlias)
  sshClient = new Client()

  const sshUser = user || config.user
  const sshIdentityFile = identityFile || config.identityFile
  
  let privateKey: Buffer | undefined
  if (sshIdentityFile && !password) {
    try {
      const filePath = sshIdentityFile.startsWith('~/') ? join(homedir(), sshIdentityFile.slice(2)) : sshIdentityFile
      privateKey = await readFile(filePath)
    } catch(e) {
      console.warn('Could not read identity file:', e)
    }
  }

  // ✅ STEP 1 → connecting
  event.sender.send('connection-progress', {
    step: 1,
    status: 'active',
    sub: 'connecting...'
  })


  return new Promise((resolve, reject) => {
    sshClient!.on('ready', () => {
      console.log(`SSH Client Ready: ${sshUser}@${config.host}`)
      event.sender.send('connection-progress', {
        step: 1,
        status: 'done',
        sub: 'connected'
      })

      setupRemoteEnvironment(sshClient!, tunnelPort, event.sender)
        .then(() => resolve({ success: true }))
        .catch(err => reject(err))
    }).on('error', (err) => {
      console.error('SSH Connection Error:', err)

      event.sender.send('connection-progress', {
        step: 1,
        status: 'error',
        sub: err.message
      })
      reject(err)

    }).connect({
      host: config.host,
      port: config.port,
      username: sshUser,
      password: password || undefined,
      privateKey: privateKey || undefined,
      agent: (!password && !privateKey) ? process.env.SSH_AUTH_SOCK : undefined,
    })
  })
})

async function setupRemoteEnvironment(conn: Client, localPort: number, webContents: Electron.WebContents) {
  const sendProgress = (step: number, status: string, sub?: string) => {
    webContents.send('connection-progress', { step, status, sub })
  }

  try {

    // 1. Bootstrap uv
    sendProgress(2, 'active', 'installing uv...')
    await executeRemote(conn, 'curl -LsSf https://astral.sh/uv/install.sh | sh')
    sendProgress(2, 'done', 'uv installed')

    // 2. Create directory
    await executeRemote(conn, 'mkdir -p ~/.zx/backend')

    // 3. SFTP the wheel
    sendProgress(3, 'active', 'deploying backend wheel...')
    const localWheel = join(_dirname, '..', 'backend', 'dist', 'zx_backend-0.1.0-py3-none-any.whl')
    await uploadFile(conn, localWheel, '.zx/backend/zx_backend-0.1.0-py3-none-any.whl')
    sendProgress(3, 'done', 'backend deployed')

    // 4. Install wheel into venv
    sendProgress(4, 'active', 'setting up python venv...')
    await executeRemote(conn, '~/.local/bin/uv venv ~/.zx/python --clear')
    await executeRemote(
      conn,
      'export PATH="$HOME/.local/bin:$PATH" && ~/.local/bin/uv pip install ~/.zx/backend/zx_backend-0.1.0-py3-none-any.whl --python ~/.zx/python/bin/python'
    )
    sendProgress(4, 'done', 'venv ready')

    await executeRemote(
      conn,
      "pkill -f 'zx.main' || true"
    )
    // 5. Start backend on remote
    sendProgress(5, 'active', 'starting remote server...')
    const remoteCmd = `
    export ZX_API_TOKEN=${API_TOKEN} && \
    export ZX_PORT=8000 && \
    ~/.zx/python/bin/python -m zx.main
    `
    conn.exec(remoteCmd, (err, stream) => {
      if (err) console.error('Error starting remote backend:', err)
      stream.on('data', (data: any) => console.log(`[Remote Backend]: ${data}`))
      stream.stderr.on('data', (data: any) => console.error(`[Remote Backend Error]: ${data}`))
    })

    // 6. Setup Tunnel
    sendProgress(6, 'active', `tunneling localhost:${localPort} ↔ 8000`)
    tunnelServer = net.createServer((sock) => {
      conn.forwardOut(sock.remoteAddress!, sock.remotePort!, '127.0.0.1', 8000, (err, stream) => {
        if (err) return sock.end()
        sock.pipe(stream).pipe(sock)
      })
    }).listen(localPort, '127.0.0.1')
    sendProgress(6, 'done', 'tunnel established')
    let attempts = 0
    let success = false
    await new Promise(res => setTimeout(res, 500))
    while (attempts < 10) {
      try {
        const res = await fetch(`http://127.0.0.1:${localPort}/health`, {
          headers: { Authorization: `Bearer ${API_TOKEN}` }
        })

        if (res.ok) {
          success = true
          break
        }
      } catch { }


      attempts++
      await new Promise(res => setTimeout(res, 500))
    }

    if (success) {
      console.log('✅ Backend ready')
      sendProgress(5, 'done', 'remote backend ready')
    } else {
      console.warn('⚠️ Backend may not be ready yet')
      sendProgress(5, 'error', 'backend not reachable')
    }

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

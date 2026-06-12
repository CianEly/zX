import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, access, writeFile, mkdir, readdir, rm, rename, stat } from 'node:fs/promises'
import { hookTemplates } from './templates'
import { constants } from 'node:fs'
import { homedir, userInfo, platform } from 'node:os'
import * as net from 'node:net'
import SSHConfig from 'ssh-config'
import { Client, type ClientChannel } from 'ssh2'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

let currentTunnelPort: number | null = null

const _dirname = dirname(fileURLToPath(import.meta.url))
const username = userInfo().username

function resolvePath(p: string) {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return resolve(p)
}

ipcMain.handle('resolve-path', (event, p: string) => resolvePath(p))

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
let sftpSession: any = null

// SSH operation queue - prevents "Channel open failure" from concurrent SSH channel opens
let sshQueue: Promise<any> = Promise.resolve()
function queueSSH<T>(fn: () => Promise<T>): Promise<T> {
  const next = sshQueue.then(() => fn()).catch(() => fn())
  sshQueue = next.catch(() => {})
  return next
}

// ─── Terminal Session Registry ───────────────────────────────────────────────
type TerminalSession =
  | { type: 'local'; pty: IPty }
  | { type: 'remote'; stream: ClientChannel }

const terminalSessions = new Map<string, TerminalSession>()

function destroyAllTerminals() {
  for (const [id, session] of terminalSessions.entries()) {
    try {
      if (session.type === 'local') session.pty.kill()
      else session.stream.end()
    } catch {}
    terminalSessions.delete(id)
  }
}

ipcMain.on('create-terminal', (event, { terminalId, env, cols, rows, cwd }: {
  terminalId: string
  env: 'local' | 'remote'
  cols: number
  rows: number
  cwd?: string
}) => {
  if (env === 'local') {
    const shell = process.env.SHELL ||
      (platform() === 'win32' ? 'cmd.exe' : platform() === 'darwin' ? '/bin/zsh' : '/bin/bash')
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || homedir(),
      env: process.env as Record<string, string>,
    })
    terminalSessions.set(terminalId, { type: 'local', pty: ptyProcess })
    ptyProcess.onData((data) => {
      mainWindow?.webContents.send(`terminal-data:${terminalId}`, data)
    })
    ptyProcess.onExit(() => {
      const currentSession = terminalSessions.get(terminalId)
      if (currentSession && currentSession.type === 'local' && currentSession.pty === ptyProcess) {
        mainWindow?.webContents.send(`terminal-exit:${terminalId}`)
        terminalSessions.delete(terminalId)
      }
    })
  } else {
    // Remote SSH shell
    if (!sshClient) {
      event.sender.send(`terminal-exit:${terminalId}`)
      return
    }
    sshClient.shell({ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 }, (err, stream) => {
      if (err) {
        event.sender.send(`terminal-exit:${terminalId}`)
        return
      }
      terminalSessions.set(terminalId, { type: 'remote', stream })
      stream.on('data', (data: Buffer) => {
        mainWindow?.webContents.send(`terminal-data:${terminalId}`, data.toString())
      })
      stream.stderr.on('data', (data: Buffer) => {
        mainWindow?.webContents.send(`terminal-data:${terminalId}`, data.toString())
      })
      stream.on('close', () => {
        const currentSession = terminalSessions.get(terminalId)
        if (currentSession && currentSession.type === 'remote' && currentSession.stream === stream) {
          mainWindow?.webContents.send(`terminal-exit:${terminalId}`)
          terminalSessions.delete(terminalId)
        }
      })
    })
  }
})

ipcMain.on('write-terminal', (_event, { terminalId, data }: { terminalId: string; data: string }) => {
  const session = terminalSessions.get(terminalId)
  if (!session) return
  if (session.type === 'local') session.pty.write(data)
  else session.stream.write(data)
})

ipcMain.on('resize-terminal', (_event, { terminalId, cols, rows }: { terminalId: string; cols: number; rows: number }) => {
  const session = terminalSessions.get(terminalId)
  if (!session) return
  if (session.type === 'local') session.pty.resize(cols, rows)
  else {
    try { (session.stream as any).setWindow(rows, cols, 0, 0) } catch {}
  }
})

ipcMain.on('close-terminal', (_event, { terminalId }: { terminalId: string }) => {
  const session = terminalSessions.get(terminalId)
  if (!session) return
  try {
    if (session.type === 'local') session.pty.kill()
    else session.stream.end()
  } catch {}
  terminalSessions.delete(terminalId)
})

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
  sftpSession = null
  currentTunnelPort = null
  return { success: true }
})

// Handle local backend spawning from frontend
ipcMain.handle('spawn-local-backend', async (event) => {
  try {
    currentTunnelPort = null // Reset tunnel port so frontend falls back to API_PORT
    
    event.sender.send('connection-progress', {
      step: 1,
      status: 'active',
      sub: 'starting local backend...'
    })

    if (!backendProcess) {
      spawnBackend()
    }
    
    // Wait for the backend to be healthy
    let attempts = 0
    let success = false
    while (attempts < 15) {
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
      event.sender.send('connection-progress', {
        step: 0,
        status: 'error',
        sub: 'Backend failed to start or health check timed out'
      })
      return { success: false, error: 'Backend failed to start or health check timed out' }
    }
    
    event.sender.send('connection-progress', {
      step: 1,
      status: 'done',
      sub: 'local process running'
    })
    event.sender.send('connection-progress', {
      step: 5,
      status: 'done',
      sub: 'token auth ok'
    })

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
      projects = projects.map((p: string) => ({ path: p, env: 'local' }))
    }
    // Auto-filter local projects whose folders no longer exist
    const filtered: typeof projects = []
    for (const proj of projects) {
      if (proj.env === 'local') {
        try { await access(resolvePath(proj.path), constants.R_OK); filtered.push(proj) } catch {}
      } else {
        filtered.push(proj)
      }
    }
    // Persist the cleaned-up list
    if (filtered.length !== projects.length) {
      await writeFile(settingsPath, JSON.stringify(filtered))
    }
    return filtered
  } catch {
    return []
  }
})

ipcMain.handle('add-recent-project', async (event, { path: rawPath, env }: { path: string, env: 'local' | 'remote' }) => {
  const path = env === 'local' ? resolvePath(rawPath) : rawPath
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

ipcMain.handle('remove-recent-project', async (event, path: string) => {
  const settingsPath = join(app.getPath('userData'), 'recent-projects.json')
  try {
    const content = await readFile(settingsPath, 'utf8')
    let projects: { path: string, env: 'local' | 'remote' }[] = JSON.parse(content)
    
    // Basic migration if it was a flat array
    if (Array.isArray(projects) && projects.length > 0 && typeof projects[0] === 'string') {
      projects = (projects as any).map((p: string) => ({ path: p, env: 'local' }))
    }

    projects = projects.filter(p => p.path !== path)
    await writeFile(settingsPath, JSON.stringify(projects))
    return projects
  } catch {
    return []
  }
})

ipcMain.handle('init-project', async (event, { path: rawPath, env }: { path: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = resolvePath(rawPath)
      await mkdir(expandedPath, { recursive: true })
      await mkdir(join(expandedPath, 'hooks'), { recursive: true })
      await mkdir(join(expandedPath, 'data'), { recursive: true })
      
      for (const [filename, content] of Object.entries(hookTemplates)) {
        try { await access(join(expandedPath, 'hooks', filename), constants.R_OK) } 
        catch { await writeFile(join(expandedPath, 'hooks', filename), content) }
      }
      return { success: true, path: expandedPath }
    } else {
      if (!sshClient) throw new Error('No active SSH connection')
      await executeRemote(sshClient, `mkdir -p ${rawPath}/hooks ${rawPath}/data`)
      const tempPath = join(app.getPath('userData'), 'temp_hooks')
      await mkdir(tempPath, { recursive: true })
      
      for (const [filename, content] of Object.entries(hookTemplates)) {
        const remoteFile = `${rawPath}/hooks/${filename}`
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
      return { success: true, path: rawPath }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('list-hooks', async (event, { projectPath, env }: { projectPath: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = resolvePath(projectPath)
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
      const expandedPath = resolvePath(projectPath)
      return await readFile(join(expandedPath, 'hooks', filename), 'utf8')
    } else {
      if (!sshClient) throw new Error('No SSH connection')
      return queueSSH(() => new Promise((resolve, reject) => {
        sshClient!.exec(`cat ${projectPath}/hooks/${filename}`, (err, stream) => {
          if (err) return reject(err)
          let data = ''
          stream.on('data', (d: any) => data += d.toString())
          stream.on('close', () => resolve(data))
        })
      }))
    }
  } catch (e: any) { return `# Error reading hook: ${e.message}` }
})

ipcMain.handle('write-hook', async (event, { projectPath, filename, content, env }: { projectPath: string, filename: string, content: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = resolvePath(projectPath)
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
      await queueSSH(() => uploadFile(sshClient!, tempT, remoteTarget))
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
      const expandedPath = resolvePath(projectPath)
      const files = await readdir(join(expandedPath, 'data'))
      return files.filter(f => f.endsWith('.csv'))
    } else {
      if (!sshClient) return []
      return queueSSH(() => new Promise((resolve) => {
        sshClient!.exec(`ls ${projectPath}/data/*.csv`, (err, stream) => {
          if (err) return resolve([])
          let data = ''
          stream.on('data', (d: any) => data += d.toString())
          stream.on('close', () => {
            const files = data.trim().split('\n').map(f => f.split('/').pop()!).filter(f => f)
            resolve(files)
          })
        })
      }))
    }
  } catch { return [] }
})

ipcMain.handle('read-data', async (event, { projectPath, filename, env }: { projectPath: string, filename: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = resolvePath(projectPath)
      return await readFile(join(expandedPath, 'data', filename), 'utf8')
    } else {
      if (!sshClient) throw new Error('No SSH connection')
      return queueSSH(() => new Promise((resolve, reject) => {
        sshClient!.exec(`cat ${projectPath}/data/${filename}`, (err, stream) => {
          if (err) return reject(err)
          let data = ''
          stream.on('data', (d: any) => data += d.toString())
          stream.on('close', () => resolve(data))
        })
      }))
    }
  } catch (e: any) { return `# Error reading data: ${e.message}` }
})

ipcMain.handle('write-data', async (event, { projectPath, filename, content, env }: { projectPath: string, filename: string, content: string, env: 'local' | 'remote' }) => {
  try {
    if (env === 'local') {
      const expandedPath = resolvePath(projectPath)
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
      await queueSSH(() => uploadFile(sshClient!, tempT, remoteTarget))
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
      const expandedPath = resolvePath(projectPath)
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
ipcMain.handle('connect-ssh', async (event, { host: hostAlias, sshPort, tunnelPort, user, password, identityFile }) => {


  if (sshClient) sshClient.end()
  if (tunnelServer) tunnelServer.close()

  currentTunnelPort = tunnelPort
  const config = await getSSHConfigForHost(hostAlias)
  sshClient = new Client()

  const finalSshPort = sshPort || config.port
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
      
      sshClient!.sftp((err, sftp) => {
        if (!err) sftpSession = sftp
      })

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
      port: finalSshPort,
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
    const localWheel = join(_dirname, '..', 'backend', 'dist', 'zx_backend-0.1.2-py3-none-any.whl')
    await uploadFile(conn, localWheel, '.zx/backend/zx_backend-0.1.2-py3-none-any.whl')
    sendProgress(3, 'done', 'backend deployed')

    // 4. Install wheel into venv
    sendProgress(4, 'active', 'setting up python venv...')
    await executeRemote(conn, '~/.local/bin/uv venv ~/.zx/python --clear')
    await executeRemote(
      conn,
      'export PATH="$HOME/.local/bin:$PATH" && ~/.local/bin/uv pip install ~/.zx/backend/zx_backend-0.1.2-py3-none-any.whl --python ~/.zx/python/bin/python'
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

// ─── File Explorer IPC ───────────────────────────────────────────────────────

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  size?: number
}

ipcMain.handle('fs-list', async (_event, { projectPath, env, targetPath }: { projectPath: string, env: 'local' | 'remote', targetPath?: string }) => {
  const dirPath = targetPath || projectPath
  if (env === 'local') {
    try {
      const files = await readdir(dirPath, { withFileTypes: true })
      const result: FileNode[] = []
      for (const file of files) {
        const fullPath = join(dirPath, file.name)
        let size = 0
        try {
          if (!file.isDirectory()) {
            const stats = await stat(fullPath)
            size = stats.size
          }
        } catch {}
        result.push({
          name: file.name,
          path: fullPath,
          isDirectory: file.isDirectory(),
          size
        })
      }
      return { success: true, files: result.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1)) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  } else {
    return queueSSH(() => new Promise((resolve) => {
      if (!sshClient || !sftpSession) return resolve({ success: false, error: 'Not connected' })
      sftpSession.readdir(dirPath, (err: any, list: any[]) => {
        if (err) return resolve({ success: false, error: err.message })
        const result: FileNode[] = list.map(item => ({
          name: item.filename,
          path: `${dirPath}/${item.filename}`.replace(/\/\//g, '/'),
          isDirectory: item.attrs.isDirectory(),
          size: item.attrs.size
        }))
        resolve({ success: true, files: result.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1)) })
      })
    }))
  }
})

ipcMain.handle('fs-read', async (_event, { path, env }: { path: string, env: 'local' | 'remote' }) => {
  if (env === 'local') {
    try {
      const content = await readFile(path, 'utf-8')
      return { success: true, content }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  } else {
    return queueSSH(() => new Promise((resolve) => {
      if (!sshClient || !sftpSession) return resolve({ success: false, error: 'Not connected' })
      sftpSession.readFile(path, 'utf-8', (err: any, content: Buffer) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true, content: content.toString('utf-8') })
      })
    }))
  }
})

ipcMain.handle('fs-delete', async (_event, { path, env }: { path: string, env: 'local' | 'remote' }) => {
  if (env === 'local') {
    try {
      await rm(path, { recursive: true, force: true })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  } else {
    return queueSSH(() => new Promise((resolve) => {
      if (!sshClient) return resolve({ success: false, error: 'Not connected' })
      sshClient.exec(`rm -rf "${path.replace(/"/g, '\\"')}"`, (err, stream) => {
        if (err) return resolve({ success: false, error: err.message })
        stream.on('close', (code: number) => {
          if (code === 0) resolve({ success: true })
          else resolve({ success: false, error: `Process exited with code ${code}` })
        }).on('data', () => {}).stderr.on('data', () => {})
      })
    }))
  }
})

ipcMain.handle('fs-rename', async (_event, { oldPath, newPath, env }: { oldPath: string, newPath: string, env: 'local' | 'remote' }) => {
  if (env === 'local') {
    try {
      await rename(oldPath, newPath)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  } else {
    return queueSSH(() => new Promise((resolve) => {
      if (!sshClient || !sftpSession) return resolve({ success: false, error: 'Not connected' })
      sftpSession.rename(oldPath, newPath, (err: any) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    }))
  }
})

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
  destroyAllTerminals()
  if (backendProcess) backendProcess.kill()
  if (sshClient) sshClient.end()
  if (tunnelServer) tunnelServer.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  destroyAllTerminals()
  if (backendProcess) backendProcess.kill()
  if (sshClient) sshClient.end()
  if (tunnelServer) tunnelServer.close()
})

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  createWindow()
})

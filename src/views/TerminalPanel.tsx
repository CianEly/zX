import { useEffect, useRef, useState, useCallback, useId } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { SplitSquareHorizontal, SplitSquareVertical, X, Plus, TerminalSquare } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SplitDir = 'h' | 'v'

interface PaneLeaf {
  kind: 'leaf'
  id: string
}
interface PaneSplit {
  kind: 'split'
  dir: SplitDir
  a: PaneNode
  b: PaneNode
}
type PaneNode = PaneLeaf | PaneSplit

let _paneCounter = 0
function newPaneId() { return `t-${++_paneCounter}` }

// ─── TerminalInstance ─────────────────────────────────────────────────────────

interface TerminalInstanceProps {
  id: string
  env: 'local' | 'remote'
  projectPath: string
  isFocused: boolean
  onFocus: () => void
  onSplitH: () => void
  onSplitV: () => void
  onClose: () => void
}

function TerminalInstance({ id, env, projectPath, isFocused, onFocus, onSplitH, onSplitV, onClose }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [exited, setExited] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0A0B0F',
        foreground: '#E8EAF0',
        cursor: '#5B6BF8',
        cursorAccent: '#0A0B0F',
        selectionBackground: 'rgba(91,107,248,0.3)',
        black: '#0A0B0F',
        red: '#F25757',
        green: '#2ECC8A',
        yellow: '#F5A623',
        blue: '#5B6BF8',
        magenta: '#B57BFF',
        cyan: '#82AAFF',
        white: '#E8EAF0',
        brightBlack: '#555870',
        brightRed: '#F25757',
        brightGreen: '#2ECC8A',
        brightYellow: '#F5A623',
        brightBlue: '#7B8BFF',
        brightMagenta: '#C792EA',
        brightCyan: '#82AAFF',
        brightWhite: '#FFFFFF',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowTransparency: true,
      convertEol: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    // Create the backend terminal session
    window.ipcRenderer.createTerminal({
      terminalId: id,
      env,
      cols: term.cols,
      rows: term.rows,
      cwd: env === 'local' ? projectPath : undefined,
    })

    // Stream data from backend → xterm
    const offData = window.ipcRenderer.onTerminalData(id, (data) => {
      term.write(data)
    })

    // Handle backend exit
    const offExit = window.ipcRenderer.onTerminalExit(id, () => {
      setExited(true)
      term.write('\r\n\x1b[1;31m[Process exited]\x1b[0m\r\n')
    })

    // Stream input: xterm → backend
    const disposeInput = term.onData((data) => {
      window.ipcRenderer.writeTerminal(id, data)
    })

    // ResizeObserver to auto-fit when container size changes
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        window.ipcRenderer.resizeTerminal(id, term.cols, term.rows)
      } catch {}
    })
    ro.observe(containerRef.current)

    return () => {
      offData()
      offExit()
      disposeInput.dispose()
      ro.disconnect()
      window.ipcRenderer.closeTerminal(id)
      term.dispose()
    }
  }, [id, env, projectPath])

  return (
    <div
      className={`term-pane${isFocused ? ' focused' : ''}`}
      onClick={onFocus}
    >
      <div className="term-bar">
        <TerminalSquare size={12} className="term-bar-icon" />
        <span className="term-bar-label">
          {env === 'remote' ? 'remote' : 'local'} — {id}
        </span>
        {exited && <span className="term-exited-badge">exited</span>}
        <div className="term-bar-actions">
          <button className="term-bar-btn" title="Split horizontally" onClick={(e) => { e.stopPropagation(); onSplitH() }}>
            <SplitSquareHorizontal size={12} />
          </button>
          <button className="term-bar-btn" title="Split vertically" onClick={(e) => { e.stopPropagation(); onSplitV() }}>
            <SplitSquareVertical size={12} />
          </button>
          <button className="term-bar-btn danger" title="Close" onClick={(e) => { e.stopPropagation(); onClose() }}>
            <X size={12} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="term-viewport" />
    </div>
  )
}

// ─── PaneTree ────────────────────────────────────────────────────────────────

interface PaneTreeProps {
  node: PaneNode
  env: 'local' | 'remote'
  projectPath: string
  focusedId: string | null
  onFocus: (id: string) => void
  onSplit: (targetId: string, dir: SplitDir) => void
  onClose: (targetId: string) => void
}

function PaneTree({ node, env, projectPath, focusedId, onFocus, onSplit, onClose }: PaneTreeProps) {
  if (node.kind === 'leaf') {
    return (
      <TerminalInstance
        id={node.id}
        env={env}
        projectPath={projectPath}
        isFocused={focusedId === node.id}
        onFocus={() => onFocus(node.id)}
        onSplitH={() => onSplit(node.id, 'h')}
        onSplitV={() => onSplit(node.id, 'v')}
        onClose={() => onClose(node.id)}
      />
    )
  }

  return (
    <div className={`term-split ${node.dir === 'h' ? 'term-split-h' : 'term-split-v'}`}>
      <div className="term-split-child">
        <PaneTree node={node.a} env={env} projectPath={projectPath} focusedId={focusedId} onFocus={onFocus} onSplit={onSplit} onClose={onClose} />
      </div>
      <div className="term-split-divider" />
      <div className="term-split-child">
        <PaneTree node={node.b} env={env} projectPath={projectPath} focusedId={focusedId} onFocus={onFocus} onSplit={onSplit} onClose={onClose} />
      </div>
    </div>
  )
}

// ─── Tree manipulation helpers ────────────────────────────────────────────────

function splitNode(root: PaneNode, targetId: string, dir: SplitDir): PaneNode {
  if (root.kind === 'leaf') {
    if (root.id !== targetId) return root
    return { kind: 'split', dir, a: root, b: { kind: 'leaf', id: newPaneId() } }
  }
  return { ...root, a: splitNode(root.a, targetId, dir), b: splitNode(root.b, targetId, dir) }
}

function removeNode(root: PaneNode, targetId: string): PaneNode | null {
  if (root.kind === 'leaf') return root.id === targetId ? null : root
  const newA = removeNode(root.a, targetId)
  const newB = removeNode(root.b, targetId)
  if (!newA) return newB
  if (!newB) return newA
  return { ...root, a: newA, b: newB }
}

function firstLeafId(node: PaneNode): string {
  if (node.kind === 'leaf') return node.id
  return firstLeafId(node.a)
}

// ─── TerminalPanel ────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  env: 'local' | 'remote'
  projectPath: string
}

export function TerminalPanel({ env, projectPath }: TerminalPanelProps) {
  const initialId = useId().replace(/:/g, 't')
  const [tree, setTree] = useState<PaneNode | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const handleAddTerminal = useCallback(() => {
    const id = newPaneId()
    setTree({ kind: 'leaf', id })
    setFocusedId(id)
  }, [])

  const handleSplit = useCallback((targetId: string, dir: SplitDir) => {
    setTree(prev => {
      if (!prev) return prev
      const next = splitNode(prev, targetId, dir)
      // Focus the newly created leaf (it will be sibling 'b' of the split)
      const newId = newPaneId.toString() // just refocus; the split fn already used the counter
      return next
    })
    // find the new leaf and focus it by looking at the updated tree
    setTimeout(() => {
      setTree(prev => {
        if (prev) setFocusedId(firstLeafId(prev))
        return prev
      })
    }, 50)
  }, [])

  const handleClose = useCallback((targetId: string) => {
    setTree(prev => {
      if (!prev) return null
      const next = removeNode(prev, targetId)
      if (next) setFocusedId(firstLeafId(next))
      else setFocusedId(null)
      return next
    })
  }, [])

  // Empty state
  if (!tree) {
    return (
      <div className="term-empty">
        <div className="term-empty-icon">
          <TerminalSquare size={32} />
        </div>
        <p className="term-empty-title">No terminal open</p>
        <p className="term-empty-sub">
          {env === 'remote' ? 'Opens a shell inside the connected remote host' : 'Opens a shell in your local project directory'}
        </p>
        <button className="btn btn-accent" onClick={handleAddTerminal}>
          <Plus size={14} /> New Terminal
        </button>
      </div>
    )
  }

  return (
    <div className="term-panel">
      <div className="term-topbar">
        <TerminalSquare size={13} style={{ color: 'var(--accent2)', flexShrink: 0 }} />
        <span className="term-topbar-label">Terminal</span>
        <span className="term-env-badge">{env}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn compact" onClick={handleAddTerminal} title="New terminal">
            <Plus size={12} /> New
          </button>
        </div>
      </div>
      <div className="term-body">
        <PaneTree
          node={tree}
          env={env}
          projectPath={projectPath}
          focusedId={focusedId}
          onFocus={setFocusedId}
          onSplit={handleSplit}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}

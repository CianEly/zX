import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { FileNode } from '../types'
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, RefreshCw, Edit2, Trash2, FileCode } from 'lucide-react'

interface FileExplorerProps {
  env: 'local' | 'remote'
  projectPath: string
}

interface TreeItem extends FileNode {
  children?: TreeItem[]
  isOpen?: boolean
  isLoaded?: boolean
}

export function FileExplorer({ env, projectPath }: FileExplorerProps) {
  const [tree, setTree] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<TreeItem | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus()
      // select text without extension
      const lastDot = renameValue.lastIndexOf('.')
      if (lastDot > 0) {
        renameInputRef.current.setSelectionRange(0, lastDot)
      } else {
        renameInputRef.current.select()
      }
    }
  }, [renamingPath])

  const loadDirectory = useCallback(async (targetPath?: string): Promise<TreeItem[]> => {
    const res = await window.ipcRenderer.fsList({ projectPath, env, targetPath })
    if (res.success && res.files) {
      return res.files as TreeItem[]
    }
    return []
  }, [projectPath, env])

  // Helper to re-fetch the tree but preserve open states
  const refreshTreePreservingState = useCallback(async (currentTree: TreeItem[]): Promise<TreeItem[]> => {
    const rootFiles = await loadDirectory()
    
    const merge = async (oldNodes: TreeItem[], newNodes: TreeItem[]): Promise<TreeItem[]> => {
      for (let i = 0; i < newNodes.length; i++) {
        const oldNode = oldNodes.find(n => n.name === newNodes[i].name && n.isDirectory)
        if (oldNode && oldNode.isOpen) {
          const children = await loadDirectory(newNodes[i].path)
          newNodes[i].children = await merge(oldNode.children || [], children)
          newNodes[i].isOpen = true
          newNodes[i].isLoaded = true
        }
      }
      return newNodes
    }
    return merge(currentTree, rootFiles)
  }, [loadDirectory])

  const initTree = useCallback(async () => {
    setLoading(true)
    const files = await loadDirectory()
    setTree(files)
    setLoading(false)
  }, [loadDirectory])

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    const newTree = await refreshTreePreservingState(tree)
    setTree(newTree)
    setLoading(false)
  }, [refreshTreePreservingState, tree])

  useEffect(() => {
    initTree()
  }, [initTree])

  useEffect(() => {
    const onFsUpdate = () => {
      handleRefresh()
    }
    window.addEventListener('fs-update', onFsUpdate)
    return () => window.removeEventListener('fs-update', onFsUpdate)
  }, [handleRefresh])

  const toggleFolder = async (path: string, currentTree: TreeItem[]): Promise<TreeItem[]> => {
    const newTree = [...currentTree]
    for (let i = 0; i < newTree.length; i++) {
      if (newTree[i].path === path) {
        if (!newTree[i].isLoaded) {
          const children = await loadDirectory(path)
          newTree[i] = { ...newTree[i], children, isLoaded: true, isOpen: true }
        } else {
          newTree[i] = { ...newTree[i], isOpen: !newTree[i].isOpen }
        }
        return newTree
      }
      if (newTree[i].children) {
        const updatedChildren = await toggleFolder(path, newTree[i].children)
        if (updatedChildren !== newTree[i].children) {
          newTree[i] = { ...newTree[i], children: updatedChildren }
          return newTree
        }
      }
    }
    return currentTree
  }

  const handleToggle = async (item: TreeItem) => {
    if (renamingPath) return // don't toggle while renaming
    if (item.isDirectory) {
      const updatedTree = await toggleFolder(item.path, tree)
      setTree(updatedTree)
    } else {
      setSelectedFile(item)
      setContentLoading(true)
      const res = await window.ipcRenderer.fsRead({ path: item.path, env })
      if (res.success) {
        setFileContent(res.content || '')
      } else {
        setFileContent(`Error loading file: ${res.error}`)
      }
      setContentLoading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, item: TreeItem) => {
    e.stopPropagation()
    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      const res = await window.ipcRenderer.fsDelete({ path: item.path, env })
      if (res.success) {
        if (selectedFile?.path === item.path) {
          setSelectedFile(null)
          setFileContent(null)
        }
        handleRefresh()
      } else {
        alert(`Failed to delete: ${res.error}`)
      }
    }
  }

  const handleRenameClick = (e: React.MouseEvent, item: TreeItem) => {
    e.stopPropagation()
    setRenamingPath(item.path)
    setRenameValue(item.name)
  }

  const handleRenameSubmit = async (item: TreeItem) => {
    if (renameValue && renameValue !== item.name) {
      const newPath = item.path.substring(0, item.path.lastIndexOf('/') + 1) + renameValue
      const res = await window.ipcRenderer.fsRename({ oldPath: item.path, newPath, env })
      if (res.success) {
        if (selectedFile?.path === item.path) {
          setSelectedFile(null)
          setFileContent(null)
        }
        // Force an immediate fetch to reflect the change
        const refreshedTree = await refreshTreePreservingState(tree)
        setTree(refreshedTree)
      } else {
        alert(`Failed to rename: ${res.error}`)
      }
    }
    setRenamingPath(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent, item: TreeItem) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(item)
    } else if (e.key === 'Escape') {
      setRenamingPath(null)
    }
  }

  const renderTree = (items: TreeItem[], level = 0) => {
    return items.map((item) => (
      <div key={item.path}>
        <div
          className={`fs-item ${selectedFile?.path === item.path ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => handleToggle(item)}
        >
          <div className="fs-item-icon">
            {item.isDirectory ? (
              item.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : <span style={{ width: 14, display: 'inline-block' }} />}
          </div>
          <div className="fs-item-icon" style={{ color: item.isDirectory ? 'var(--accent2)' : 'var(--text3)' }}>
            {item.isDirectory ? (
              item.isOpen ? <FolderOpen size={14} /> : <Folder size={14} />
            ) : item.name.endsWith('.py') || item.name.endsWith('.json') || item.name.endsWith('.csv') ? (
              <FileCode size={14} />
            ) : (
              <FileText size={14} />
            )}
          </div>
          
          {renamingPath === item.path ? (
            <input 
              ref={renameInputRef}
              type="text" 
              className="fs-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => handleRenameKeyDown(e, item)}
              onBlur={() => handleRenameSubmit(item)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="fs-item-name">{item.name}</span>
          )}

          {!renamingPath && (
            <div className="fs-item-actions">
              <button className="fs-action-btn" onClick={(e) => handleRenameClick(e, item)} title="Rename">
                <Edit2 size={12} />
              </button>
              <button className="fs-action-btn danger" onClick={(e) => handleDelete(e, item)} title="Delete">
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
        {item.isDirectory && item.isOpen && item.children && (
          <div className="fs-children">
            {renderTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ))
  }

  return (
    <div className="fs-panel">
      <div className="fs-sidebar">
        <div className="fs-header">
          <span className="fs-header-title">EXPLORER</span>
          <button className="btn btn-ghost compact" onClick={handleRefresh} title="Refresh">
            <RefreshCw size={12} className={loading ? 'pulse' : ''} />
          </button>
        </div>
        <div className="fs-tree">
          {loading && tree.length === 0 ? (
            <div className="fs-empty">Loading...</div>
          ) : tree.length === 0 ? (
            <div className="fs-empty">Directory is empty</div>
          ) : (
            renderTree(tree)
          )}
        </div>
      </div>
      <div className="fs-viewer">
        {selectedFile ? (
          <div className="fs-viewer-content">
            <div className="fs-viewer-header">
              <span className="fs-viewer-title">{selectedFile.path}</span>
            </div>
            {contentLoading ? (
              <div className="fs-viewer-body fs-empty">Loading file...</div>
            ) : (
              <pre className="fs-viewer-body">{fileContent}</pre>
            )}
          </div>
        ) : (
          <div className="fs-empty">
            <FileText size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
            Select a file to view its contents
          </div>
        )}
      </div>
    </div>
  )
}

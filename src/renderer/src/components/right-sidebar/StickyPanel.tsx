/* eslint-disable max-lines -- Why: StickyPanel co-locates the project-scoped note list,
 * markdown editor/preview, and compact help/safety popovers so the sidebar workflow remains
 * straightforward and avoids prop-drilling across tiny one-off components. */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  StickyNote,
  Plus,
  Trash2,
  Save,
  Pencil,
  FileText,
  CircleHelp,
  TriangleAlert,
  Eye,
  SquarePen,
  X,
  Check,
  PanelRight
} from 'lucide-react'
import { toast } from 'sonner'
import { useActiveWorktree } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import type { MarkdownDocument } from '../../../../shared/types'

const DEFAULT_CONTENT = '# '

const MARKDOWN_HELP_ROWS = [
  { label: 'Heading', syntax: '# Title' },
  { label: 'Bold / Italic', syntax: '**bold**  *italic*' },
  { label: 'Quote', syntax: '> Important note' },
  { label: 'List', syntax: '- item\n- item' },
  { label: 'Task list', syntax: '- [ ] todo\n- [x] done' },
  { label: 'Link', syntax: '[label](https://example.com)' },
  { label: 'Inline code', syntax: '`npm run dev`' },
  { label: 'Code block', syntax: '```bash\nnpm run dev\n```' },
  { label: 'Table', syntax: '| Name | Value |\n| --- | --- |\n| Env | Dev |' }
]

export default function StickyPanel(): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const projectPath = activeWorktree?.path ?? ''

  const [documents, setDocuments] = useState<MarkdownDocument[]>([])
  const [selectedDoc, setSelectedDoc] = useState<MarkdownDocument | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newDocName, setNewDocName] = useState('')
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

  const createInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const loadDocuments = useCallback(async () => {
    if (!projectPath) {
      setDocuments([])
      return
    }
    try {
      const docs = await window.api.sticky.list(projectPath)
      setDocuments(docs)
    } catch {
      setDocuments([])
    }
  }, [projectPath])

  // Load documents when the active project/worktree changes.
  useEffect(() => {
    if (!projectPath) {
      return
    }
    loadDocuments()
  }, [loadDocuments, projectPath])

  // Focus the create-input when shown
  useEffect(() => {
    if (showCreateInput && createInputRef.current) {
      createInputRef.current.focus()
    }
  }, [showCreateInput])

  // Focus the rename-input when shown
  useEffect(() => {
    if (renamingDocId && renameInputRef.current) {
      renameInputRef.current.focus()
    }
  }, [renamingDocId])

  const handleSelect = useCallback(
    async (doc: MarkdownDocument) => {
      if (!projectPath) {
        return
      }

      // If switching away from a doc with unsaved changes, save automatically
      if (hasUnsavedChanges && selectedDoc) {
        try {
          await window.api.sticky.write(projectPath, selectedDoc.relativePath, editorContent)
        } catch {
          // best-effort auto-save
        }
      }

      try {
        const result = await window.api.sticky.read(projectPath, doc.relativePath)
        if (result) {
      setSelectedDoc(doc)
      setEditorContent(result.content)
      setHasUnsavedChanges(false)
      // Why: skip preview for files that only have markdown heading
      // skeletons (e.g. '# ', '## ') with no actual text content.
      const trimmed = result.content.trim()
      const hasRealContent =
        trimmed.length > 2 && !/^#+\s*$/.test(trimmed)
      setViewMode(hasRealContent ? 'preview' : 'edit')
          setShowCreateInput(false)
          setRenamingDocId(null)
        }
      } catch {
        toast.error('Failed to read sticky note')
      }
    },
    [projectPath, hasUnsavedChanges, selectedDoc, editorContent]
  )

  const handleSave = useCallback(async () => {
    if (!projectPath || !selectedDoc) {
      return
    }
    try {
      const result = await window.api.sticky.write(
        projectPath,
        selectedDoc.relativePath,
        editorContent
      )
      if (result) {
        setSelectedDoc(result)
        setHasUnsavedChanges(false)
        toast.success('Note saved')
        await loadDocuments()
      }
    } catch {
      toast.error('Failed to save note')
    }
  }, [projectPath, selectedDoc, editorContent, loadDocuments])

  const handleCreate = useCallback(async () => {
    if (!projectPath || !newDocName.trim()) {
      return
    }
    const fileName = newDocName.trim().endsWith('.md')
      ? newDocName.trim()
      : `${newDocName.trim()}.md`
    try {
      const result = await window.api.sticky.write(projectPath, fileName, DEFAULT_CONTENT)
      if (result) {
        setShowCreateInput(false)
        setNewDocName('')
        setSelectedDoc(result)
        setEditorContent(DEFAULT_CONTENT)
        setHasUnsavedChanges(false)
        setViewMode('edit')
        await loadDocuments()
      }
    } catch {
      toast.error('Failed to create note')
    }
  }, [projectPath, newDocName, loadDocuments])

  const handleDelete = useCallback(
    async (doc: MarkdownDocument) => {
      if (!projectPath) {
        return
      }
      try {
        const success = await window.api.sticky.delete(projectPath, doc.relativePath)
        if (success) {
          if (selectedDoc?.relativePath === doc.relativePath) {
            setSelectedDoc(null)
            setEditorContent('')
            setHasUnsavedChanges(false)
            setViewMode('edit')
          }
          toast.success('Note deleted')
          await loadDocuments()
        }
      } catch {
        toast.error('Failed to delete note')
      }
    },
    [projectPath, selectedDoc, loadDocuments]
  )

  const handleRename = useCallback(async () => {
    if (!projectPath || !renamingDocId || !renameValue.trim()) {
      return
    }
    const newFileName = renameValue.trim().endsWith('.md')
      ? renameValue.trim()
      : `${renameValue.trim()}.md`
    try {
      const result = await window.api.sticky.rename(projectPath, renamingDocId, newFileName)
      if (result) {
        setRenamingDocId(null)
        setRenameValue('')
        if (selectedDoc?.relativePath === renamingDocId) {
          setSelectedDoc(result)
        }
        toast.success('Note renamed')
        await loadDocuments()
      }
    } catch {
      toast.error('Failed to rename note')
    }
  }, [projectPath, renamingDocId, renameValue, selectedDoc, loadDocuments])

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCreate()
      } else if (e.key === 'Escape') {
        setShowCreateInput(false)
        setNewDocName('')
      }
    },
    [handleCreate]
  )

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRename()
      } else if (e.key === 'Escape') {
        setRenamingDocId(null)
        setRenameValue('')
      }
    },
    [handleRename]
  )

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Save on Ctrl+S / Cmd+S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    },
    [handleSave]
  )

  const handleEditorChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorContent(e.target.value)
    setHasUnsavedChanges(true)
  }, [])

  const startRename = useCallback((doc: MarkdownDocument) => {
    setRenamingDocId(doc.relativePath)
    setRenameValue(doc.name)
  }, [])

  if (!projectPath) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto scrollbar-sleek">
        <Header />
        <div className="flex flex-col items-center justify-center flex-1 px-4 text-center text-muted-foreground">
          <PanelRight size={32} className="mb-3 opacity-50" />
          <p className="text-xs">Open a project to create sticky notes.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header onAddClick={() => setShowCreateInput(true)} />

      {showCreateInput && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border">
          <input
            ref={createInputRef}
            type="text"
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            placeholder="Note name..."
            className="flex-1 h-7 px-2 text-xs bg-input border border-border rounded
                       outline-none focus-visible:ring-1 focus-visible:ring-ring
                       placeholder:text-muted-foreground"
          />
          <button
            onClick={handleCreate}
            disabled={!newDocName.trim()}
            className="p-1 rounded hover:bg-accent disabled:opacity-40"
            title="Create"
          >
            <Check size={14} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => {
              setShowCreateInput(false)
              setNewDocName('')
            }}
            className="p-1 rounded hover:bg-accent"
            title="Cancel"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0">
        {/* Document list — hidden if we're viewing a doc */}
        {(documents.length > 0 || showCreateInput) && !selectedDoc && (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek border-b border-border">
            {documents.map((doc) => (
              <div key={doc.relativePath}>
                {renamingDocId === doc.relativePath ? (
                  <div className="flex items-center gap-1 px-3 py-1.5">
                    <FileText size={14} className="shrink-0 text-muted-foreground" />
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      className="flex-1 h-7 px-2 text-xs bg-input border border-border rounded
                                 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <button
                      onClick={handleRename}
                      disabled={!renameValue.trim()}
                      className="p-1 rounded hover:bg-accent disabled:opacity-40"
                      title="Confirm rename"
                    >
                      <Check size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => {
                        setRenamingDocId(null)
                        setRenameValue('')
                      }}
                      className="p-1 rounded hover:bg-accent"
                      title="Cancel rename"
                    >
                      <X size={14} className="text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSelect(doc)}
                    className={cn(
                      'flex items-center w-full gap-2 px-3 py-1.5 text-left text-xs',
                      'hover:bg-accent transition-colors group'
                    )}
                  >
                    <FileText size={14} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{doc.name}</span>
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startRename(doc)
                        }}
                        className="p-0.5 rounded hover:bg-accent-foreground/10"
                        title="Rename"
                      >
                        <Pencil size={12} className="text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(doc)
                        }}
                        className="p-0.5 rounded hover:bg-accent-foreground/10"
                        title="Delete"
                      >
                        <Trash2 size={12} className="text-muted-foreground" />
                      </button>
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        {selectedDoc ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Active doc header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card shrink-0">
              <span className="text-xs font-medium truncate flex-1">{selectedDoc.name}</span>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <div className="flex items-center rounded border border-border bg-background p-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setViewMode('edit')}
                        aria-label="Edit markdown"
                        className={cn(
                          'relative flex size-6 items-center justify-center rounded transition-colors',
                          viewMode === 'edit'
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <SquarePen size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      Edit markdown
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        aria-label="Preview markdown"
                        className={cn(
                          'relative flex size-6 items-center justify-center rounded transition-colors',
                          viewMode === 'preview'
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <Eye size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      Preview markdown
                    </TooltipContent>
                  </Tooltip>
                </div>
                <MarkdownHelpPopover />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!hasUnsavedChanges}
                      aria-label="Save sticky note"
                      className="relative flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                    >
                      <Save size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    Save (Ctrl+S)
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDoc(null)
                        setEditorContent('')
                        setHasUnsavedChanges(false)
                        setViewMode('edit')
                      }}
                      aria-label="Back to sticky list"
                      className="relative flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    Back to list
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Editor / Markdown preview */}
            <div className="flex flex-col flex-1 min-h-0">
              {viewMode === 'edit' ? (
                <textarea
                  ref={editorRef}
                  value={editorContent}
                  onChange={handleEditorChange}
                  onKeyDown={handleEditorKeyDown}
                  className="flex-1 min-h-0 w-full resize-none bg-input text-sm text-foreground
                             p-3 outline-none border-none font-mono leading-relaxed
                             placeholder:text-muted-foreground scrollbar-sleek"
                  placeholder="Start writing markdown..."
                  spellCheck={false}
                />
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto bg-editor-surface p-3 scrollbar-sleek">
                  <CommentMarkdown
                    content={editorContent}
                    variant="document"
                    className="text-sm leading-relaxed text-foreground"
                  />
                </div>
              )}
            </div>
          </div>
        ) : documents.length === 0 && !showCreateInput ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center flex-1 px-4 text-center text-muted-foreground">
            <StickyNote size={32} className="mb-3 opacity-50" />
            <p className="text-sm font-medium">Sticky Notes</p>
            <p className="text-xs mt-1 mb-4">
              Create markdown notes scoped to your project workspace.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowCreateInput(true)}>
              <Plus size={14} className="mr-1" />
              New Note
            </Button>
          </div>
        ) : (
          /* List visible, no doc selected — show a hint */
          <div className="flex flex-col items-center justify-center shrink-0 px-4 py-4 text-center text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <StickyNote size={16} className="opacity-40" />
              <p className="text-xs">Select a note or create a new one.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Shared header component. */
function Header({ onAddClick }: { onAddClick?: () => void }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sticky
        </span>
        <StickySecretsWarning />
      </div>
      {onAddClick && (
        <button
          onClick={onAddClick}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="New note"
        >
          <Plus size={14} className="text-muted-foreground" />
        </button>
      )}
    </div>
  )
}

function StickySecretsWarning(): React.JSX.Element {
  return (
    <Tooltip>
      <Popover>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Sticky notes safety"
            >
              <TriangleAlert size={14} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Sticky notes safety
        </TooltipContent>
        <PopoverContent align="start" className="w-64 p-3">
          <div className="flex gap-2 text-[11px] leading-4 text-muted-foreground">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <div className="mb-1 font-semibold text-foreground">Do not store secrets</div>
              <p>
                Keep API keys and passwords out of Sticky notes. Use environment variables or a
                secrets manager.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Tooltip>
  )
}

function MarkdownHelpPopover(): React.JSX.Element {
  return (
    <Tooltip>
      <Popover>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Markdown help"
            >
              <CircleHelp size={14} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Markdown help
        </TooltipContent>
        <PopoverContent align="end" className="w-80 p-3">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-foreground">Markdown help</div>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                Sticky notes support GitHub-style Markdown. Use Preview to verify formatting.
              </p>
            </div>
            <div className="space-y-1.5">
              {MARKDOWN_HELP_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 text-[11px]"
                >
                  <div className="pt-1 text-muted-foreground">{row.label}</div>
                  <pre className="overflow-x-auto whitespace-pre rounded bg-accent px-2 py-1 font-mono text-[10.5px] leading-4 text-foreground scrollbar-sleek">
                    {row.syntax}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Tooltip>
  )
}

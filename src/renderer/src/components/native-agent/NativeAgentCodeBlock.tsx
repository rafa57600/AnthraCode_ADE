import React, { useCallback, useMemo, useState } from 'react'
import { Check, Copy, CornerDownLeft } from 'lucide-react'

type NativeAgentCodeBlockProps = React.HTMLAttributes<HTMLPreElement> & {
  children?: React.ReactNode
  onInsertCode?: (code: string, language?: string) => void
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node) && node.props) {
    return extractText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

function extractLanguage(children: React.ReactNode): string | undefined {
  let language: string | undefined
  React.Children.forEach(children, (child) => {
    if (language || !React.isValidElement(child)) return
    const className = (child.props as { className?: string }).className
    const match = className?.match(/(?:^|\s)language-([^\s]+)/)
    if (match?.[1]) language = match[1]
  })
  return language
}

export default function NativeAgentCodeBlock({
  children,
  onInsertCode,
  ...props
}: NativeAgentCodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const code = useMemo(() => extractText(children).replace(/\n$/, ''), [children])
  const language = useMemo(() => extractLanguage(children), [children])

  const handleCopy = useCallback(() => {
    void window.api.ui
      .writeClipboardText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        // Clipboard failures should not break message rendering.
      })
  }, [code])

  const handleInsert = useCallback(() => {
    onInsertCode?.(code, language)
  }, [code, language, onInsertCode])

  return (
    <div className="code-block-wrapper group">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-1 py-1 text-[11px] text-muted-foreground opacity-0 shadow-xs transition group-hover:opacity-100 group-focus-within:opacity-100">
        {language && (
          <span className="max-w-24 truncate px-1.5 font-mono uppercase tracking-wide">
            {language}
          </span>
        )}
        {onInsertCode && (
          <button
            type="button"
            onClick={handleInsert}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Insert code into prompt"
            title="Insert into prompt"
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
            Insert
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-6 items-center gap-1 rounded px-1.5 transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Copy code"
          title="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre {...props}>{children}</pre>
    </div>
  )
}

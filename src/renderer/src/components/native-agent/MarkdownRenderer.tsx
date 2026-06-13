/**
 * MarkdownRenderer — Lightweight markdown for Pi agent chat messages.
 *
 * Renders LLM output with GitHub-flavored markdown (tables, strikethrough),
 * syntax-highlighted code blocks, and a copy button on each code fence.
 *
 * Why a separate component instead of reusing MarkdownPreview (1697 lines)?
 * MarkdownPreview is designed for editing markdown *files* — it carries
 * document links, table-of-contents, review notes, file-resolution, and
 * search machinery that a chat message doesn't need.  This renderer sticks
 * to the three plugins that matter for agent output: GFM tables, line-break
 * preservation, and syntax highlighting.
 */

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import NativeAgentCodeBlock from './NativeAgentCodeBlock'
import type { Components } from 'react-markdown'

type MarkdownRendererProps = {
  content: string
  /** Whether the app is in dark mode. Controls which hljs theme classes are active. */
  isDark?: boolean
  onInsertCode?: (code: string, language?: string) => void
}

export default function MarkdownRenderer({
  content,
  isDark = true,
  onInsertCode,
}: MarkdownRendererProps): React.JSX.Element {
  const components: Components = {
    // Why: agent output code is action-oriented. The native chat wrapper keeps
    // copy/insert controls local to chat without pulling in MarkdownPreview.
    pre: ({ children, ...props }) => (
      <NativeAgentCodeBlock {...props} onInsertCode={onInsertCode}>{children}</NativeAgentCodeBlock>
    ),
  }

  return (
    // Why: rehype-highlight emits <span class="hljs-*"> tokens. The markdown-
    // preview CSS scopes these under .markdown-dark / .markdown-light so they
    // don't bleed into other UI. We reuse the same class convention.
    <div className={`${isDark ? 'markdown-dark' : 'markdown-light'} agent-markdown`}>
      <div className="markdown-body">
        <Markdown
          components={components}
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeHighlight]}
        >
          {content}
        </Markdown>
      </div>
    </div>
  )
}

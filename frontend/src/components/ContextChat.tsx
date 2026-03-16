"use client"

import React, { useState, useRef, useEffect } from 'react'
import { Send, Loader2, BookOpen, Brain, Globe, Link2 } from 'lucide-react'
import { api, ContextChatSource, ContextChatResponse } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ContextChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: ContextChatSource[]
  source_type?: 'context' | 'llm' | 'web'
}

interface ContextChatProps {
  projectId: number
  onSourceClick?: (source: ContextChatSource) => void
}

function SourceTypeBadge({ type }: { type: 'context' | 'llm' | 'web' }) {
  if (type === 'context') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <BookOpen size={10} /> From Project Context
      </span>
    )
  }
  if (type === 'web') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
        <Globe size={10} /> Web URL
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
      <Brain size={10} /> LLM Knowledge
    </span>
  )
}

function SourceChip({ source, onClick }: { source: ContextChatSource; onClick?: () => void }) {
  const isUrl = source.provider === 'web_url'
  return (
    <button
      onClick={onClick}
      title={source.name}
      className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1 rounded-full transition-colors max-w-[220px] truncate"
    >
      {isUrl ? <Link2 size={10} className="shrink-0 text-sky-500" /> : <BookOpen size={10} className="shrink-0 text-blue-500" />}
      <span className="truncate">{isUrl ? new URL(source.name).hostname : source.name}</span>
    </button>
  )
}

export function ContextChat({ projectId, onSourceClick }: ContextChatProps) {
  const [messages, setMessages] = useState<ContextChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || loading) return

    const userMsg: ContextChatMessage = { role: 'user', content: question }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const result: ContextChatResponse = await api.contextChat(projectId, question, history)
      const assistantMsg: ContextChatMessage = {
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
        source_type: result.source_type,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Error: ${err.message}`,
        source_type: 'llm',
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 gap-3 pt-8">
            <BookOpen size={32} className="text-slate-300" />
            <p className="text-sm font-medium">Ask anything about your project context</p>
            <p className="text-xs text-slate-400 max-w-[220px]">You can also paste a URL and I'll read it for you</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="bg-blue-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] shadow-sm">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[90%] space-y-2">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="prose prose-sm prose-slate max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                </div>
                {/* Attribution */}
                {msg.source_type && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    <SourceTypeBadge type={msg.source_type} />
                  </div>
                )}
                {/* Source chips */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-1">
                    {msg.sources.map((src, si) => (
                      <SourceChip
                        key={si}
                        source={src}
                        onClick={() => onSourceClick?.(src)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <Loader2 size={16} className="animate-spin text-slate-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask about your context, or paste a URL..."
            className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-h-[40px] max-h-[120px]"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white p-2.5 rounded-xl transition-all shadow-sm"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

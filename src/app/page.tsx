import { ChatInterface } from '@/components/chat-interface'

/**
 * Root page — Server Component shell.
 * The interactive chat UI is a client component loaded below.
 */
export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="shrink-0 border-b px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight">LCA Research Preview</h1>
          <span className="text-xs text-muted-foreground">Vercel AI Stack spike · not production</span>
        </div>
      </header>

      {/* Main content */}
      <main className="min-h-0 flex-1">
        <ChatInterface />
      </main>
    </div>
  )
}

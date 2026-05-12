'use client'

import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  SpeechInput,
  SpeechInputCancelButton,
  SpeechInputRecordButton,
} from '@/components/ui/speech-input'
import { cn } from '@/lib/utils'

// The Scribe WS server tears down its TCP socket without an explicit close
// frame, so the browser reports code 1006 even after we call ws.close(1000).
// @elevenlabs/client logs that as console.error, which Next.js dev surfaces as
// a red overlay. Filter just this one benign message once per page load.
if (typeof window !== 'undefined' && !(window as unknown as { __scribeSilenced?: boolean }).__scribeSilenced) {
  ;(window as unknown as { __scribeSilenced?: boolean }).__scribeSilenced = true
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' && first.startsWith('WebSocket closed unexpectedly:')) {
      return
    }
    originalError.apply(console, args)
  }
}

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  isDisabled: boolean
}

async function fetchScribeToken(): Promise<string> {
  const res = await fetch('/api/scribe-token', { method: 'POST' })
  if (!res.ok) {
    throw new Error(`Failed to fetch Scribe token: ${res.status}`)
  }
  const data = (await res.json()) as { token: string }
  return data.token
}

export function ChatInput({ input, onInputChange, onSubmit, isDisabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Snapshot of the textarea value at the moment recording started, so each
  // streaming transcript update can overwrite the textarea with prefix + transcript.
  const prefixRef = useRef('')
  const [isRecording, setIsRecording] = useState(false)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isDisabled && input.trim()) {
        onSubmit()
      }
    }
  }

  const handleSpeechStart = useCallback(() => {
    prefixRef.current = input
    setIsRecording(true)
  }, [input])

  const handleSpeechChange = useCallback(
    (data: { transcript: string }) => {
      const prefix = prefixRef.current
      const transcript = data.transcript
      if (!prefix) {
        onInputChange(transcript)
      } else if (!transcript) {
        onInputChange(prefix)
      } else {
        onInputChange(`${prefix.trimEnd()} ${transcript}`)
      }
    },
    [onInputChange],
  )

  const handleSpeechStop = useCallback(() => {
    setIsRecording(false)
    textareaRef.current?.focus()
  }, [])

  const handleSpeechCancel = useCallback(() => {
    setIsRecording(false)
    onInputChange(prefixRef.current)
    textareaRef.current?.focus()
  }, [onInputChange])

  return (
    <div className="flex items-end gap-2 border-t bg-background px-4 py-3">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isRecording ? 'Listening…' : "Tell me about what you're building…"}
        className={cn(
          'min-h-[44px] max-h-[160px] resize-none rounded-xl border-input',
          'text-sm leading-relaxed',
        )}
        disabled={isDisabled || isRecording}
        rows={1}
      />
      <SpeechInput
        getToken={fetchScribeToken}
        onStart={handleSpeechStart}
        onChange={handleSpeechChange}
        onStop={handleSpeechStop}
        onCancel={handleSpeechCancel}
        size="lg"
        className="shrink-0"
      >
        <SpeechInputRecordButton
          className="rounded-xl"
          disabled={isDisabled}
        />
        <SpeechInputCancelButton className="rounded-xl" />
      </SpeechInput>
      <Button
        size="icon"
        onClick={onSubmit}
        disabled={isDisabled || isRecording || !input.trim()}
        className="h-10 w-10 shrink-0 rounded-xl"
        aria-label="Send message"
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </div>
  )
}

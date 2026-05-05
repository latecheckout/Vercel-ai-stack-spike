'use client'

import { useRef, type KeyboardEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  isDisabled: boolean
}

export function ChatInput({ input, onInputChange, onSubmit, isDisabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isDisabled && input.trim()) {
        onSubmit()
      }
    }
  }

  return (
    <div className="flex items-end gap-2 border-t bg-background px-4 py-3">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Tell me about what you're building…"
        className={cn(
          'min-h-[44px] max-h-[160px] resize-none rounded-xl border-input',
          'text-sm leading-relaxed',
        )}
        disabled={isDisabled}
        rows={1}
      />
      <Button
        size="icon"
        onClick={onSubmit}
        disabled={isDisabled || !input.trim()}
        className="h-10 w-10 shrink-0 rounded-xl"
        aria-label="Send message"
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </div>
  )
}

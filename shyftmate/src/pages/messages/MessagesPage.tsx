import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Send, Hash, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import api, { showApiError } from '@/lib/api'
import { formatRelative, initials, cn } from '@/lib/utils'
import type { Message, MessageChannel } from '@/types'
import { useAuth } from '@/hooks/useAuth'

function useChannels() {
  return useQuery<MessageChannel[]>({
    queryKey: ['message-channels'],
    queryFn: async () => {
      const { data } = await api.get('/messages/channels')
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load channels'),
  } as Parameters<typeof useQuery>[0])
}

function useMessages(channelId: string | null) {
  return useQuery<Message[]>({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      if (!channelId) return []
      const { data } = await api.get(`/messages/channels/${channelId}/messages`)
      return data
    },
    enabled: !!channelId,
    refetchInterval: 5000,
    onError: (e) => showApiError(e, 'Failed to load messages'),
  } as Parameters<typeof useQuery>[0])
}

// Mock channels for preview
const MOCK_CHANNELS: MessageChannel[] = [
  { id: 'general', name: 'general', type: 'general', unread_count: 2, last_message: 'Roster is out for next week', last_message_at: new Date(Date.now() - 20 * 60000).toISOString() },
  { id: 'team-a', name: 'team-a', type: 'team', unread_count: 0, last_message: 'Thanks everyone!', last_message_at: new Date(Date.now() - 3 * 3600000).toISOString() },
  { id: 'managers', name: 'managers', type: 'team', unread_count: 5, last_message: 'Budget meeting Monday 10am', last_message_at: new Date(Date.now() - 30 * 60000).toISOString() },
]

const MOCK_MESSAGES: Message[] = [
  { id: '1', org_id: 'o1', sender_id: 'u1', sender_name: 'Sarah Chen', sender_avatar: null, content: 'Roster is out for next week 📅', channel: 'general', created_at: new Date(Date.now() - 20 * 60000).toISOString(), is_read: false },
  { id: '2', org_id: 'o1', sender_id: 'u2', sender_name: 'Marcus Thompson', sender_avatar: null, content: 'Thanks Sarah! I\'m on Tuesday–Friday, looks good.', channel: 'general', created_at: new Date(Date.now() - 15 * 60000).toISOString(), is_read: true },
  { id: '3', org_id: 'o1', sender_id: 'u3', sender_name: 'Priya Nair', sender_avatar: null, content: 'Can someone cover my Saturday shift? Family event came up.', channel: 'general', created_at: new Date(Date.now() - 5 * 60000).toISOString(), is_read: false },
]

export default function MessagesPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [activeChannelId, setActiveChannelId] = useState<string | null>('general')
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: channels = MOCK_CHANNELS, isLoading: channelsLoading } = useChannels()
  const { data: messages = MOCK_MESSAGES, isLoading: messagesLoading } = useMessages(activeChannelId)

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/messages/channels/${activeChannelId}/messages`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', activeChannelId] })
      setMessage('')
    },
    onError: (e) => showApiError(e, 'Failed to send message'),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const trimmed = message.trim()
    if (!trimmed) return
    sendMutation.mutate(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-lg border border-neutral-200 overflow-hidden bg-white">
      {/* Channel list */}
      <div className="w-64 border-r border-neutral-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-200">
          <h2 className="font-semibold text-neutral-900">Messages</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {channelsLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))
              : channels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChannelId(ch.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
                      activeChannelId === ch.id
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-neutral-600 hover:bg-neutral-50'
                    )}
                  >
                    <Hash className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 truncate font-medium">{ch.name}</span>
                    {ch.unread_count > 0 && (
                      <Badge variant="default" className="text-[10px] h-4 px-1.5 min-w-[18px] flex items-center justify-center">
                        {ch.unread_count}
                      </Badge>
                    )}
                  </button>
                ))}
          </div>
        </ScrollArea>
      </div>

      {/* Messages area */}
      {activeChannel ? (
        <div className="flex-1 flex flex-col">
          {/* Channel header */}
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2">
            <Hash className="w-4 h-4 text-neutral-400" />
            <h3 className="font-semibold text-neutral-900">{activeChannel.name}</h3>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-4">
            {messagesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-400">
                <MessageSquare className="w-8 h-8 mb-2" />
                <p className="text-sm">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isOwn = msg.sender_id === user?.id
                  return (
                    <div key={msg.id} className={cn('flex gap-3', isOwn && 'flex-row-reverse')}>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={msg.sender_avatar ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {initials(msg.sender_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn('max-w-[70%]', isOwn && 'items-end flex flex-col')}>
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-medium text-neutral-700">
                            {msg.sender_name}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {formatRelative(msg.created_at)}
                          </span>
                        </div>
                        <div
                          className={cn(
                            'px-3 py-2 rounded-lg text-sm',
                            isOwn
                              ? 'bg-primary-600 text-white'
                              : 'bg-neutral-100 text-neutral-800'
                          )}
                        >
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="px-4 py-3 border-t border-neutral-200 flex gap-2">
            <Input
              placeholder={`Message #${activeChannel.name}`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendMutation.isPending}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!message.trim() || sendMutation.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-400">
          <div className="text-center">
            <MessageSquare className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">Select a channel to start messaging</p>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'

import { fetchInbox, subscribeInbox, type InboxMessage } from '@/lib/mentorAcademics'
import { cn } from '@/lib/utils'

// Latest messages students sent from their phone dashboards. Opening the
// student's page marks their messages as read.
export function MessagesInbox() {
  const [inbox, setInbox] = useState<{ unread: number; recent: InboxMessage[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const load = () =>
      fetchInbox()
        .then((r) => {
          setInbox(r)
          setError(false)
        })
        .catch(() => setError(true))
    void load()
    return subscribeInbox(() => void load())
  }, [])

  // Hidden until 0008 is applied (table missing) rather than showing an error box.
  if (error || !inbox) return null

  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="size-4 text-primary" />
          Messages from students
        </h2>
        {inbox.unread > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
            {inbox.unread} new
          </span>
        )}
      </div>
      {inbox.recent.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No messages yet. Students can write from their phone dashboard.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {inbox.recent.map((m) => (
            <li key={m.id}>
              <Link to={`/dashboard/${m.student_id}`} className="flex items-start gap-3 py-2 hover:bg-accent/40">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', m.read_at ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={cn('truncate', !m.read_at && 'font-semibold')}>
                      {m.student_name} <span className="text-xs font-normal text-muted-foreground">{m.roll_number}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{m.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

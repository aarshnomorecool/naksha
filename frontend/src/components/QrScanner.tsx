import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CircleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Camera scanner that runs inside the page. Students scan the class QR from
// here instead of their camera app, so the link opens in this same browser —
// camera apps often open links in their own browser, which has a different
// storage and would make an already-linked phone look unlinked.
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const id = `qr-${useId().replace(/:/g, '')}`
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    const scanner = new Html5Qrcode(id)
    let started = false
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        (text) => {
          if (done.current) return
          done.current = true
          onResultRef.current(text)
        },
        undefined,
      )
      .then(() => {
        started = true
      })
      .catch(() =>
        setError(
          'Camera access was blocked. Allow camera access for this site in your browser settings, then try again.',
        ),
      )
    return () => {
      if (started) scanner.stop().then(() => scanner.clear()).catch(() => {})
    }
  }, [id])

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium">Point at the code on your teacher's screen</span>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close scanner">
          <X className="size-4" />
        </Button>
      </div>
      {error ? (
        <p className="flex items-start gap-2 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      ) : (
        <div id={id} className="aspect-square w-full bg-black" />
      )}
    </div>
  )
}

// Accepts any Naksha class code (…/scan?room=…&t=…), whichever address it was
// generated on, and returns the in-app path to open. Anything else → null.
export function classCodePath(text: string): string | null {
  try {
    const url = new URL(text)
    if (url.pathname !== '/scan' || !url.searchParams.get('t') || !url.searchParams.get('room')) return null
    return `/scan?room=${encodeURIComponent(url.searchParams.get('room')!)}&t=${encodeURIComponent(url.searchParams.get('t')!)}`
  } catch {
    return null
  }
}

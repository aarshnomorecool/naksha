import { useState } from 'react'

// Phones get the student panel; computers (and tablets, which teachers often
// use to project) get staff sign-in and the class QR screen. Detection is a
// best guess, so the choice can be overridden from the UI and is remembered.

export type DeviceKind = 'phone' | 'computer'

const OVERRIDE_KEY = 'naksha-device-kind'

function detect(): DeviceKind {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'computer'
  const ua = navigator.userAgent
  if (/iPad|Tablet/i.test(ua)) return 'computer'
  if (/iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|Opera Mini|BlackBerry/i.test(ua)) return 'phone'
  return window.matchMedia('(pointer: coarse) and (max-width: 767px)').matches ? 'phone' : 'computer'
}

export function getDeviceKind(): DeviceKind {
  try {
    const saved = localStorage.getItem(OVERRIDE_KEY)
    if (saved === 'phone' || saved === 'computer') return saved
  } catch {
    // storage blocked: fall back to detection
  }
  return detect()
}

export function setDeviceKind(kind: DeviceKind) {
  try {
    localStorage.setItem(OVERRIDE_KEY, kind)
  } catch {
    // storage blocked: the choice just won't persist
  }
}

export function useDeviceKind(): DeviceKind {
  const [kind] = useState(getDeviceKind)
  return kind
}

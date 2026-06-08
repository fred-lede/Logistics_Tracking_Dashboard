'use client'

import { useState, useEffect } from 'react'

function getTime(): string {
  if (typeof window === 'undefined') return ''
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

export function TvClock() {
  const [time, setTime] = useState(getTime)

  useEffect(() => {
    setTime(getTime())
    const id = setInterval(() => setTime(getTime()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!time) return null

  return (
    <span
      className="font-semibold tabular-nums"
      style={{ fontSize: '1.875rem', color: '#e2e8f0', position: 'relative', zIndex: 100 }}
    >
      {time}
    </span>
  )
}

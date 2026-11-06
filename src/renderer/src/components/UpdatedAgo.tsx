import { useEffect, useState } from 'react'
import { formatAgo } from '../lib/format'

interface UpdatedAgoProps {
  iso: string | null | undefined
  verb?: string
}

export function UpdatedAgo({ iso, verb = 'Updated' }: UpdatedAgoProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <span>
      {verb} {formatAgo(iso, now)}
    </span>
  )
}

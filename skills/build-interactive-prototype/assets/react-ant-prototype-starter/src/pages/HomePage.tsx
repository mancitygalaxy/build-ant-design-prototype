import { useEffect, useState } from 'react'
import { PrototypePage } from '../components/PrototypePage'
import { starterCopy } from '../data/demo'
import { normalizeCount } from '../domain/prototype'

const STORAGE_KEY = 'prototype.starter.counter.v1'

function readStoredCount() {
  return normalizeCount(Number(sessionStorage.getItem(STORAGE_KEY) ?? 0))
}

export function HomePage() {
  const [count, setCount] = useState(readStoredCount)

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, String(count))
  }, [count])

  return (
    <PrototypePage
      count={count}
      copy={starterCopy}
      onIncrement={() => setCount((current) => normalizeCount(current + 1))}
    />
  )
}


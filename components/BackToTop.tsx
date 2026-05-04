'use client'

import { useEffect, useState } from 'react'

const SHOW_AFTER_PX = 480

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 24,
        zIndex: 50,
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--cream)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        cursor: 'pointer',
        fontSize: 20,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent)',
        fontFamily: "'Courier Prime', monospace",
      }}
      title="Back to top"
      aria-label="Back to top"
    >
      ↑
    </button>
  )
}

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import AstTree from './AstTree.jsx'

// ── Highlighted code view ─────────────────────────────────
function HighlightedCode({ source, token }) {
  if (!source) {
    return <pre className="playback-code">No code to display.</pre>
  }
  if (!token) {
    return <pre className="playback-code">{source}</pre>
  }

  const s = Math.max(0, Math.min(token.start, source.length))
  const e = Math.max(s, Math.min(token.end, source.length))

  return (
    <pre className="playback-code">
      {source.slice(0, s)}
      <mark className="token-highlight">{source.slice(s, e)}</mark>
      {source.slice(e)}
    </pre>
  )
}

// ── Playback component ────────────────────────────────────
export default function Playback({ code, isDark }) {
  const [tokens, setTokens]                   = useState([])
  const [astText, setAstText]                 = useState('')
  const [perTokenAstLines, setPerTokenAstLines] = useState([])
  const [cursor, setCursor]                   = useState(-1)
  const [playing, setPlaying]                 = useState(false)
  const [speed, setSpeed]                     = useState(1500) // slider value: 100=slowest(2000ms) → 2000=fastest(100ms)
  const [loading, setLoading]                 = useState(false)
  const [fetchError, setFetchError]           = useState(null)
  const [follow, setFollow]                   = useState(() => localStorage.getItem('ast-follow-camera') !== 'false')
  const intervalRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('ast-follow-camera', String(follow))
  }, [follow])

  // ── Fetch tokens + AST on Start ────────────────────────
  const handleStart = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    setPlaying(false)
    setCursor(-1)
    setTokens([])
    setAstText('')
    setPerTokenAstLines([])

    try {
      const res = await fetch('/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()

      if (data.error && (!data.tokens || data.tokens.length === 0)) {
        setFetchError(data.error || 'Error')
        return
      }

      setTokens(data.tokens || [])
      setAstText(data.astText || '')
      setPerTokenAstLines(data.perTokenAstLines || [])
      setCursor(0)
    } catch (err) {
      setFetchError(`Network error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [code])

  // ── Auto-play ──────────────────────────────────────────
  useEffect(() => {
    if (!playing || tokens.length === 0) {
      clearInterval(intervalRef.current)
      return
    }

    const intervalMs = 2100 - speed  // slider 100→2000ms, slider 2000→100ms
    intervalRef.current = setInterval(() => {
      setCursor(prev => {
        if (prev >= tokens.length - 1) {
          setPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, intervalMs)

    return () => clearInterval(intervalRef.current)
  }, [playing, speed, tokens.length])

  const astLineCount = useMemo(() => astText ? astText.split('\n').length : 0, [astText])
  const revealedLines = useMemo(() => {
    if (!astText || tokens.length === 0 || cursor < 0) return 0
    if (perTokenAstLines.length > 0 && cursor < perTokenAstLines.length) {
      return perTokenAstLines[cursor]
    }
    return Math.ceil(astLineCount * ((cursor + 1) / tokens.length))
  }, [astLineCount, astText, cursor, perTokenAstLines, tokens.length])

  const currentToken = cursor >= 0 && cursor < tokens.length ? tokens[cursor] : null
  const notStarted   = cursor < 0
  const atEnd        = cursor >= tokens.length - 1
  const progress     = notStarted || tokens.length === 0 ? 0 : ((cursor + 1) / tokens.length) * 100

  return (
    <div className="playback-container">

      {/* Controls */}
      <div className="playback-controls">
        <button onClick={handleStart} disabled={loading}>
          {loading ? 'Loading…' : 'Start / Reset'}
        </button>
        <button
          onClick={() => { setPlaying(false); setCursor(c => Math.max(0, c - 1)) }}
          disabled={notStarted || cursor <= 0}
        >
          ◀ Prev
        </button>
        <button
          onClick={() => { setPlaying(false); setCursor(c => Math.min(tokens.length - 1, c + 1)) }}
          disabled={notStarted || atEnd}
        >
          Step ▶
        </button>
        <button
          onClick={() => setPlaying(p => !p)}
          disabled={notStarted || tokens.length === 0}
          className={playing ? 'playback-btn-active' : ''}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>

        <label className="speed-label">
          <span>Slow</span>
          <input
            type="range"
            min="100"
            max="2000"
            step="50"
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="speed-slider"
          />
          <span>Fast</span>
        </label>

        <label className="follow-toggle">
          <input
            type="checkbox"
            checked={follow}
            onChange={event => setFollow(event.target.checked)}
          />
          <span className="follow-toggle-track" aria-hidden="true"><span /></span>
          <span>Follow</span>
        </label>

        {!notStarted && tokens.length > 0 && (
          <span className="token-counter">
            {cursor + 1} / {tokens.length}
          </span>
        )}

        {currentToken && (
          <span className="token-badge">
            <span className="token-badge-type">{currentToken.type}</span>
            <span className="token-badge-value">{currentToken.value}</span>
          </span>
        )}
      </div>

      <div className="build-progress" aria-live="polite">
        <div className="build-progress-copy">
          <span className={`build-status-dot ${playing ? 'is-playing' : ''}`} />
          <span>
            {currentToken
              ? <>Building <strong>{currentToken.type}</strong> <code>{currentToken.value}</code></>
              : 'Ready to build the AST'}
          </span>
        </div>
        <div className="build-progress-track" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <span className="build-progress-percent">{Math.round(progress)}%</span>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="playback-error">{fetchError}</div>
      )}

      {/* Split view */}
      <div className="playback-split">
        <div className="playback-left">
          {notStarted
            ? <div className="playback-placeholder">Click Start / Reset to begin playback.</div>
            : <HighlightedCode source={code} token={currentToken} />
          }
        </div>
        <div className="playback-right">
          <AstTree
            text={astText}
            isDark={isDark}
            revealedLines={revealedLines}
            follow={follow}
            onFollowInterrupt={() => setFollow(false)}
          />
        </div>
      </div>

    </div>
  )
}

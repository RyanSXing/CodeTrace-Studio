import { useState, useEffect, useRef, useCallback } from 'react'
import AstTree from './AstTree.jsx'

// ── ENV display ───────────────────────────────────────────
function EnvPanel({ env, isDark }) {
  const entries = Object.entries(env)
  const bg      = isDark ? '#1a1a1a' : '#f8f8f8'
  const border  = isDark ? '#3a3a3a' : '#ddd'

  return (
    <div className="trace-env-panel" style={{ background: bg, borderColor: border }}>
      <div className="trace-env-title">Variables (ENV)</div>
      {entries.length === 0
        ? <div className="trace-env-empty">— no variables —</div>
        : entries.map(([k, v]) => (
          <div key={k} className="trace-env-row">
            <span className="trace-env-name">{k}</span>
            <span className="trace-env-eq">=</span>
            <span className="trace-env-val">{v}</span>
          </div>
        ))
      }
    </div>
  )
}

// ── Step info card ────────────────────────────────────────
function StepCard({ step, total }) {
  if (!step) return null

  const isReturn = step.phase === 'return'
  const isError  = step.phase === 'error'

  const arrow = isReturn ? '←' : isError ? '✕' : '→'
  const verb  = isReturn ? 'returned' : isError ? 'error in' : 'evaluating'
  const accentColor = isError ? '#e04040' : isReturn ? '#4ec94e' : '#4da8e8'

  return (
    <div className="trace-step-card">
      <div className="trace-step-header" style={{ borderLeftColor: accentColor }}>
        <span className="trace-step-arrow" style={{ color: accentColor }}>{arrow}</span>
        <span className="trace-step-verb" style={{ color: accentColor }}>{verb}</span>
        <span className="trace-step-label">{step.label}</span>
        <span className="trace-step-counter">{step.step + 1} / {total}</span>
      </div>

      {isReturn && step.returned !== null && (
        <div className="trace-step-result">
          <span className="trace-result-key">result</span>
          <span className="trace-result-val">{step.returned}</span>
        </div>
      )}

      {isError && step.error && (
        <div className="trace-step-result trace-step-result-error">
          <span className="trace-result-key">error</span>
          <span className="trace-result-val">{step.error}</span>
        </div>
      )}

      {step.printed && (
        <div className="trace-step-result">
          <span className="trace-result-key">printed</span>
          <span className="trace-result-val trace-printed-val">"{step.printed.trimEnd()}"</span>
        </div>
      )}
    </div>
  )
}

// ── EvalTrace component ───────────────────────────────────
export default function EvalTrace({ code, isDark }) {
  const [steps, setSteps]       = useState([])
  const [astText, setAstText]   = useState('')
  const [cursor, setCursor]     = useState(-1)
  const [playing, setPlaying]   = useState(false)
  const [speed, setSpeed]       = useState(1500)
  const [loading, setLoading]   = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [follow, setFollow] = useState(() => localStorage.getItem('eval-follow-camera') !== 'false')
  const intervalRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('eval-follow-camera', String(follow))
  }, [follow])

  // ── Fetch trace on Start ───────────────────────────────
  const handleStart = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    setPlaying(false)
    setCursor(-1)
    setSteps([])
    setAstText('')

    try {
      const res  = await fetch('/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()

      if (data.error) {
        setFetchError(data.error)
        return
      }

      setSteps(data.steps || [])
      setAstText(data.ast || '')
      setCursor(0)
    } catch (err) {
      setFetchError(`Network error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [code])

  // ── Auto-play ──────────────────────────────────────────
  useEffect(() => {
    if (!playing || steps.length === 0) {
      clearInterval(intervalRef.current)
      return
    }
    const intervalMs = 2100 - speed
    intervalRef.current = setInterval(() => {
      setCursor(prev => {
        if (prev >= steps.length - 1) { setPlaying(false); return prev }
        return prev + 1
      })
    }, intervalMs)
    return () => clearInterval(intervalRef.current)
  }, [playing, speed, steps.length])

  const currentStep  = cursor >= 0 && cursor < steps.length ? steps[cursor] : null
  const notStarted   = cursor < 0
  const atEnd        = cursor >= steps.length - 1

  // Highlighted node: use the nodeId from the current step.
  // Only highlight on "return" phases (when evaluation of that node is complete)
  // so the user sees the node light up when its value is known.
  const highlightNodeId = currentStep ? currentStep.nodeId : null

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
          onClick={() => { setPlaying(false); setCursor(c => Math.min(steps.length - 1, c + 1)) }}
          disabled={notStarted || atEnd}
        >
          Step ▶
        </button>
        <button
          onClick={() => setPlaying(p => !p)}
          disabled={notStarted || steps.length === 0}
          className={playing ? 'playback-btn-active' : ''}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>

        <label className="speed-label">
          <span>Slow</span>
          <input
            type="range" min="100" max="2000" step="50"
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

        {!notStarted && steps.length > 0 && (
          <span className="token-counter">{cursor + 1} / {steps.length}</span>
        )}

        {currentStep && (
          <span className="token-badge">
            <span className="token-badge-type">{currentStep.nodeType}</span>
            <span className="token-badge-value">{currentStep.phase}</span>
          </span>
        )}
      </div>

      {/* Error */}
      {fetchError && <div className="playback-error">{fetchError}</div>}

      {/* Split view */}
      <div className="playback-split">

        {/* Left: step info + ENV */}
        <div className="playback-left trace-left">
          {notStarted ? (
            <div className="playback-placeholder">Click Start / Reset to begin evaluation trace.</div>
          ) : (
            <>
              <StepCard step={currentStep} total={steps.length} />
              <EnvPanel env={currentStep?.env ?? {}} isDark={isDark} />
            </>
          )}
        </div>

        {/* Right: AST tree with active node highlighted */}
        <div className="playback-right">
          <AstTree
            text={astText}
            isDark={isDark}
            highlightNodeId={notStarted ? null : highlightNodeId}
            follow={follow}
            onFollowInterrupt={() => setFollow(false)}
          />
        </div>
      </div>

    </div>
  )
}

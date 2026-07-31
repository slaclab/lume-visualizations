import { useEffect, useState } from 'react'
import { fetchConfig } from './api/client'
import { InteractiveTab } from './tabs/InteractiveTab'
import { LiveTab } from './tabs/LiveTab'
import type { ConfigResponse } from './types'

type Tab = 'live' | 'interactive'

export default function App() {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [tab, setTab] = useState<Tab>('live')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig().then(setConfig).catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <div className="app-error">Failed to load config: {error}</div>
  if (!config) return <div className="app-loading">Loading…</div>

  return (
    <div className="app">
      <header className="app-header">
        <h1>LUME Live Stream Monitor</h1>
        <span className="version">{config.version}</span>
      </header>

      <nav className="tab-nav">
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
          Live monitoring
        </button>
        <button
          className={tab === 'interactive' ? 'active' : ''}
          onClick={() => setTab('interactive')}
        >
          Interactive offline changes
        </button>
      </nav>

      {tab === 'live' && <LiveTab config={config} />}
      {tab === 'interactive' && <InteractiveTab config={config} />}
    </div>
  )
}

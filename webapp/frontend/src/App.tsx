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
      {tab === 'live' && <LiveTab config={config} tab={tab} onTab={setTab} />}
      {tab === 'interactive' && <InteractiveTab config={config} tab={tab} onTab={setTab} />}
    </div>
  )
}

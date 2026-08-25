import type { ReactNode } from 'react'
import { useTheme } from '../theme'

type Tab = 'live' | 'interactive'

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  )
}

interface Props {
  version: string
  tab: Tab
  onTab: (t: Tab) => void
  /** Settings controls rendered at the top of the sidebar. */
  settings: ReactNode
  /** Optional scrollable slider list (interactive mode). */
  sliders?: ReactNode
  /** Main content: scalar chips + plot grid. */
  children: ReactNode
  status: string
}

export function DashboardLayout({
  version,
  tab,
  onTab,
  settings,
  sliders,
  children,
  status,
}: Props) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-settings">{settings}</div>
        {sliders ? (
          <div className="sidebar-sliders">
            <div className="sidebar-heading">Inputs</div>
            <div className="sidebar-sliders-scroll">{sliders}</div>
          </div>
        ) : null}
      </aside>

      <main className="main">
        <header className="app-header">
          <div className="app-header-left">
            <h1>LUME Live Stream Monitor</h1>
            <nav className="tab-nav">
              <button className={tab === 'live' ? 'active' : ''} onClick={() => onTab('live')}>
                Live monitoring
              </button>
              <button
                className={tab === 'interactive' ? 'active' : ''}
                onClick={() => onTab('interactive')}
              >
                Interactive offline changes
              </button>
            </nav>
          </div>
          <div className="app-header-right">
            <span className="version">{version}</span>
            <ThemeToggle />
          </div>
        </header>

        <div className="main-body">{children}</div>

        <div className="status">{status}</div>
      </main>
    </div>
  )
}

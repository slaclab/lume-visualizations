import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'

/** Colors consumed by canvas/uPlot plots (JS strings, kept in sync with index.css). */
export interface PlotColors {
  bg: string
  grid: string
  axis: string
  muted: string
  scatter: string
}

export const PLOT_THEMES: Record<Theme, PlotColors> = {
  dark: {
    bg: '#161b22',
    grid: '#30363d',
    axis: '#c9d1d9',
    muted: '#8b949e',
    scatter: 'rgba(88,166,255,0.35)',
  },
  light: {
    bg: '#ffffff',
    grid: '#d0d7de',
    axis: '#1f2328',
    muted: '#656d76',
    scatter: 'rgba(9,105,218,0.4)',
  },
}

const STORAGE_KEY = 'lume-theme'

function initialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

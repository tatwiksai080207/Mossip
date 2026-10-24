import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  type ThemeDefinition,
  AVAILABLE_THEMES,
  DEFAULT_THEME_ID,
  getThemeById,
  applyThemeTokens,
} from '../themes'

interface ThemeContextType {
  currentTheme: ThemeDefinition
  setThemeId: (id: string) => void
  availableThemes: ThemeDefinition[]
}

const STORAGE_KEY = 'inji_playground_color_theme_v2'

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: getThemeById(DEFAULT_THEME_ID),
  setThemeId: () => {},
  availableThemes: AVAILABLE_THEMES,
})

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && AVAILABLE_THEMES.some(t => t.id === saved)) {
        return saved
      }
    }
    return DEFAULT_THEME_ID
  })

  const currentTheme = getThemeById(themeId)

  const setThemeId = (newId: string) => {
    if (AVAILABLE_THEMES.some(t => t.id === newId)) {
      setThemeIdState(newId)
      localStorage.setItem(STORAGE_KEY, newId)
    }
  }

  useEffect(() => {
    applyThemeTokens(currentTheme)
  }, [currentTheme])

  return (
    <ThemeContext.Provider value={{ currentTheme, setThemeId, availableThemes: AVAILABLE_THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

import { useEffect, useState } from 'react'

// Reactive CSS media-query match. Returns false when matchMedia is unavailable
// (jsdom/SSR), so callers default to the no-match branch in tests.
export function useMediaQuery(query: string): boolean {
  const read = () =>
    typeof window !== 'undefined' && window.matchMedia?.(query).matches === true
  const [matches, setMatches] = useState(read)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

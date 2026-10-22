export function generatePkceVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  let result = ''
  const randomValues = new Uint8Array(43)
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomValues)
    for (let i = 0; i < randomValues.length; i++) {
      result += chars[randomValues[i] % chars.length]
    }
  } else {
    for (let i = 0; i < 43; i++) {
      result += chars[Math.floor(Math.random() * chars.length)]
    }
  }
  return result
}

export async function computePkceChallenge(verifier: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const hash = await window.crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
  return verifier
}

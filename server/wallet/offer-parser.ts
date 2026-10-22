import type { CredentialOffer } from './types'

/** Accepts an offer object, a `credential_offer=` deep link, or a JSON string. */
export function parseOffer(input: unknown): CredentialOffer {
  if (input && typeof input === 'object') return input as CredentialOffer

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.startsWith('{')) return JSON.parse(trimmed)

    // openid-credential-offer://?credential_offer=<urlencoded json>
    const query = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : trimmed
    const params = new URLSearchParams(query)
    const inline = params.get('credential_offer')
    if (inline) return JSON.parse(inline)
    throw new Error('Offer deep link carries no credential_offer parameter (credential_offer_uri is not supported yet)')
  }

  throw new Error('Unrecognised credential offer input')
}

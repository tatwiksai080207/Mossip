/**
 * Provider Registry pattern implementation.
 * Decouples the HTTP router from concrete identity stack implementations.
 */

import type { IssuerProvider, VerifierProvider } from './types'

export class ProviderRegistry {
  private issuers = new Map<string, IssuerProvider>()
  private verifiers = new Map<string, VerifierProvider>()

  registerIssuer(provider: IssuerProvider): void {
    this.issuers.set(provider.id.toLowerCase(), provider)
  }

  getIssuer(id: string): IssuerProvider | undefined {
    return this.issuers.get(id.toLowerCase())
  }

  listIssuers(): IssuerProvider[] {
    return Array.from(this.issuers.values())
  }

  registerVerifier(provider: VerifierProvider): void {
    this.verifiers.set(provider.id.toLowerCase(), provider)
  }

  getVerifier(id: string): VerifierProvider | undefined {
    return this.verifiers.get(id.toLowerCase())
  }

  listVerifiers(): VerifierProvider[] {
    return Array.from(this.verifiers.values())
  }

  clear(): void {
    this.issuers.clear()
    this.verifiers.clear()
  }
}

// Global registry singleton
export const providerRegistry = new ProviderRegistry()

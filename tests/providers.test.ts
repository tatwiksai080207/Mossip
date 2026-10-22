import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ProviderRegistry } from '../server/providers/provider-registry'
import type { IssuerProvider, VerifierProvider } from '../server/providers/types'

describe('Provider Registry Pattern (Scalability & Extensibility)', () => {
  it('should register and resolve an external issuer adapter', async () => {
    const registry = new ProviderRegistry()

    const mockEudiIssuer: IssuerProvider = {
      id: 'eudi-issuer',
      name: 'EU Digital Identity Wallet Issuer',
      description: 'Standards-compliant European Digital Identity Provider',
      supportedFormats: ['vc+sd-jwt', 'mso_mdoc'],
      async getMetadata(baseUrl: string) {
        return { issuer: `${baseUrl}/eudi`, credentials_supported: ['PID', 'mDL'] }
      },
      async issueCredential(params) {
        return {
          format: params.format,
          credential: 'mock-eudi-credential-payload',
          credential_configuration_id: params.credentialType,
          c_nonce: 'cnonce-eudi-1234',
          c_nonce_expires_in: 3600,
        }
      },
    }

    registry.registerIssuer(mockEudiIssuer)
    assert.equal(registry.listIssuers().length, 1)

    const resolved = registry.getIssuer('eudi-issuer')
    assert.ok(resolved)
    assert.equal(resolved.name, 'EU Digital Identity Wallet Issuer')
    assert.deepEqual(resolved.supportedFormats, ['vc+sd-jwt', 'mso_mdoc'])

    const issued = await resolved.issueCredential({
      baseUrl: 'http://localhost:3001',
      format: 'vc+sd-jwt',
      credentialType: 'PID',
      holderDid: 'did:key:z6Mk...',
    })
    assert.equal(issued.credential, 'mock-eudi-credential-payload')
  })

  it('should register and resolve an external verifier adapter', async () => {
    const registry = new ProviderRegistry()

    const mockVerifier: VerifierProvider = {
      id: 'spruce-verifier',
      name: 'SpruceID OpenID4VP Verifier',
      description: 'DIF / ISO 18013-7 verification engine',
      supportedFormats: ['ldp_vc', 'vc+sd-jwt'],
      async createRequest() {
        return { authorization_endpoint: 'openid4vp://', nonce: 'spruce-nonce-99' }
      },
      async verifyPresentation(vp) {
        return {
          verified: Boolean(vp),
          providerId: 'spruce-verifier',
          checks: { signature: true, holderBinding: true },
        }
      },
    }

    registry.registerVerifier(mockVerifier)
    assert.equal(registry.listVerifiers().length, 1)

    const resolved = registry.getVerifier('spruce-verifier')
    assert.ok(resolved)
    assert.equal(resolved.name, 'SpruceID OpenID4VP Verifier')

    const outcome = await resolved.verifyPresentation({ dummy: 'token' })
    assert.equal(outcome.verified, true)
    assert.equal(outcome.checks.signature, true)
  })

  it('should return undefined when requesting unregistered providers', () => {
    const registry = new ProviderRegistry()
    assert.equal(registry.getIssuer('non-existent'), undefined)
    assert.equal(registry.getVerifier('non-existent'), undefined)
  })
})

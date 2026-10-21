export const CERTIFY_INTERNAL_DOCKER = 'http://certify-nginx:80'
export const COLLAB_ESIGNET_PATTERN = new RegExp('https://esignet[^"\\s]*', 'g')

export function buildDidDocument({
  baseUrl,
  localCertifyEdKey,
  localCertifyP256Key,
}: {
  baseUrl: string
  localCertifyEdKey: any
  localCertifyP256Key: any
}) {
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/:/g, '%3A')
  const didWeb = `did:web:${host}`
  const didWebPath = `${didWeb}:api:local-certify`
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: didWeb,
    alsoKnownAs: [
      didWebPath,
      'did:web:host.docker.internal%3A3001',
      'did:web:certify-nginx%3A80',
    ],
    verificationMethod: [
      {
        id: `${didWeb}#key-0`,
        type: 'Ed25519VerificationKey2020',
        controller: didWeb,
        publicKeyMultibase: localCertifyEdKey.publicKeyMultibase || 'z6Mkst4pBviY5YxiTz5m9yR5XjpWNjE252HZMmokdXYgPMGN',
      },
      {
        id: `${didWebPath}#key-0`,
        type: 'Ed25519VerificationKey2020',
        controller: didWebPath,
        publicKeyMultibase: localCertifyEdKey.publicKeyMultibase || 'z6Mkst4pBviY5YxiTz5m9yR5XjpWNjE252HZMmokdXYgPMGN',
      },
      {
        id: 'did:web:host.docker.internal%3A3001#R-tBgzITi4Z5vLd-Rg1aU7s6T7lCIVlf-KEFeir3Mas',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:web:host.docker.internal%3A3001',
        publicKeyMultibase: 'z6Mkst4pBviY5YxiTz5m9yR5XjpWNjE252HZMmokdXYgPMGN',
      },
      {
        id: `${didWeb}#key-p256`,
        type: 'JsonWebKey2020',
        controller: didWeb,
        publicKeyJwk: localCertifyP256Key.publicJwk,
      },
      {
        id: `${didWebPath}#key-p256`,
        type: 'JsonWebKey2020',
        controller: didWebPath,
        publicKeyJwk: localCertifyP256Key.publicJwk,
      },
    ],
    authentication: [
      `${didWeb}#key-0`,
      `${didWebPath}#key-0`,
      `${didWeb}#key-p256`,
      `${didWebPath}#key-p256`,
    ],
    assertionMethod: [
      `${didWeb}#key-0`,
      `${didWebPath}#key-0`,
      'did:web:host.docker.internal%3A3001#R-tBgzITi4Z5vLd-Rg1aU7s6T7lCIVlf-KEFeir3Mas',
      `${didWeb}#key-p256`,
      `${didWebPath}#key-p256`,
    ],
  }
}

export function buildJwks({
  localCertifyP256Key,
  localCertifyEdKey,
}: {
  localCertifyP256Key: any
  localCertifyEdKey: any
}) {
  return {
    keys: [
      localCertifyP256Key.publicJwk,
      localCertifyEdKey.publicJwk,
    ],
  }
}

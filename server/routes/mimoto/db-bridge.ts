import crypto from 'crypto'
import pg from 'pg'
import { getPublicBaseUrl } from '../../tunnel'
import { env } from '../../config/env'
import { issueMdocCredential } from '../../formats/mdoc'
import { issueLdpCredential, type DataModel } from '../../formats/ldp'
import { issueSdJwtCredential } from '../../formats/sd-jwt'

export async function getMimotoDbClient(): Promise<pg.Client> {
  const candidates = [
    { host: env.database.host, port: env.database.port },
    { host: process.env.DATABASE_HOST || 'database', port: Number(process.env.DATABASE_PORT || 5432) },
    { host: 'localhost', port: 5433 },
    { host: '127.0.0.1', port: 5433 },
    { host: 'localhost', port: 5432 },
  ]
  for (const c of candidates) {
    try {
      const client = new pg.Client({
        host: c.host,
        port: c.port,
        user: env.database.user,
        password: env.database.password,
        database: env.database.database,
        connectionTimeoutMillis: 1500,
      })
      await client.connect()
      return client
    } catch {
      // try next candidate
    }
  }
  throw new Error('Could not connect to PostgreSQL inji_mimoto database')
}

export interface PlaygroundIssuanceToMimotoParams {
  walletId: string
  credentialConfigurationId?: string
  issuerId?: string
  playgroundIssuer: any
}

export async function handlePlaygroundIssuanceToMimoto(
  params: PlaygroundIssuanceToMimotoParams
): Promise<{ credentialId: string }> {
  const { walletId, credentialConfigurationId, issuerId = 'Playground', playgroundIssuer } = params

  const credType = credentialConfigurationId || 'PlaygroundIdentityCredential'
  const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
  const isSdJwt = credType.includes('SDJWT') || credType.includes('sd-jwt') || credType.includes('SD_JWT')
  const isVcdm2 = credType.includes('2.0') || credType.includes('VCDM2.0')
  const isFarmer =
    credType.includes('Farmer') ||
    credType.toLowerCase().includes('farmer') ||
    issuerId === 'Farmer' ||
    issuerId.toLowerCase().includes('farmer') ||
    issuerId.toLowerCase().includes('agri')

  let compactCred = ''
  if (isMdoc) {
    const claims = isFarmer
      ? {
          family_name: 'Cooper',
          given_name: 'Gorge',
          birth_date: '1990-05-25',
          issue_date: '2023-01-15',
          expiry_date: '2033-01-15',
          issuing_country: 'IN',
          issuing_authority: 'Karnataka Transport Department',
          document_number: 'DL-5720110023456',
          driving_privileges: ['B'],
        }
      : {
          family_name: 'Raghunathan',
          given_name: 'Asha',
          birth_date: '1991-07-14',
          issue_date: '2022-01-01',
          expiry_date: '2032-01-01',
          issuing_country: 'IN',
          issuing_authority: 'Karnataka Transport Department',
          document_number: 'DL-5720110023456',
          driving_privileges: ['B', 'A1'],
        }
    const mdoc = await issueMdocCredential({
      issuerKey: playgroundIssuer.key,
      issuerUrl: `${getPublicBaseUrl()}/api/playground-issuer`,
      docType: 'org.iso.18013.5.1.mDL',
      claims,
    })
    compactCred = mdoc.compact
  } else if (isFarmer && isSdJwt) {
    const sdjwt = await issueSdJwtCredential({
      issuerKey: playgroundIssuer.key,
      issuerUrl: `${getPublicBaseUrl()}/api/playground-issuer`,
      vct: 'https://inji.mosip.io/credentials/farmer-identity',
      claims: {
        fullName: 'Gorge Cooper',
        farmerID: '2154189532',
        mobileNumber: '9876543210',
        dateOfBirth: '1990-05-25',
        gender: 'Male',
        state: 'Karnataka',
        district: 'Bangalore',
        villageOrTown: 'Koramangala',
        postalCode: '453000',
        landArea: '3 hectares',
        landOwnershipType: 'Owner',
        primaryCropType: 'Maize',
        secondaryCropType: 'Rice',
      },
    })
    compactCred = sdjwt.compact
  } else if (isSdJwt) {
    const sdjwt = await issueSdJwtCredential({
      issuerKey: playgroundIssuer.key,
      issuerUrl: `${getPublicBaseUrl()}/api/playground-issuer`,
      vct: 'https://inji-playground.mosip.dev/credentials/identity',
      claims: {
        fullName: 'Asha Raghunathan',
        dateOfBirth: '1991-07-14',
        gender: 'Female',
        email: 'asha.r@example.org',
        region: 'Karnataka',
      },
    })
    compactCred = sdjwt.compact
  } else if (isFarmer) {
    const dataModel: DataModel = isVcdm2 ? '2.0' : '1.1'
    const vc = await issueLdpCredential({
      key: playgroundIssuer.key,
      dataModel,
      credentialType: 'FarmerCredential',
      subject: {
        fullName: 'Gorge Cooper',
        farmerID: '2154189532',
        mobileNumber: '9876543210',
        dateOfBirth: '25-05-1990',
        gender: 'Male',
        state: 'Karnataka',
        district: 'Bangalore',
        villageOrTown: 'Koramangala',
        postalCode: '453000',
        landArea: '3 hectares',
        landOwnershipType: 'Owner',
        primaryCropType: 'Maize',
        secondaryCropType: 'Rice',
      },
      holderDid: playgroundIssuer.key.did,
    })
    compactCred = JSON.stringify(vc)
  } else {
    const dataModel: DataModel = isVcdm2 ? '2.0' : '1.1'
    const vc = await issueLdpCredential({
      key: playgroundIssuer.key,
      dataModel,
      credentialType: 'PlaygroundIdentityCredential',
      subject: {
        fullName: 'Asha Raghunathan',
        dateOfBirth: '1991-07-14',
        gender: 'Female',
        email: 'asha.r@example.org',
        region: 'Karnataka',
      },
      holderDid: playgroundIssuer.key.did,
    })
    compactCred = JSON.stringify(vc)
  }

  const client = await getMimotoDbClient()
  try {
    const actualIssuer = isFarmer ? 'Farmer' : issuerId || 'Playground'
    const actualCredType =
      isFarmer && isSdJwt ? 'FarmerCredential_SD_JWT' : isFarmer && !isMdoc ? 'FarmerCredential' : credType
    const format =
      isFarmer && isSdJwt
        ? 'vc+sd-jwt'
        : isFarmer && !isMdoc
        ? 'ldp_vc'
        : isMdoc
        ? 'mso_mdoc'
        : isSdJwt
        ? 'vc+sd-jwt'
        : 'jwt_vc_json'

    const existing = await client.query(
      `SELECT id FROM public.verifiable_credentials WHERE wallet_id = $1 AND (credential_metadata->>'credentialType' = $2 OR credential_metadata->>'credentialConfigurationId' = $2)`,
      [walletId, actualCredType]
    )

    let credId: string
    if (existing.rows.length > 0) {
      credId = existing.rows[0].id
      await client.query(
        `UPDATE public.verifiable_credentials SET credential = $1, updated_at = now() WHERE id = $2`,
        [compactCred, credId]
      )
      console.log(`[wallet-bridge] Updated existing ${actualCredType} ${credId} in wallet ${walletId}`)
    } else {
      credId = crypto.randomUUID()
      const displayName =
        isFarmer && isSdJwt
          ? 'Farmer SD-JWT Credential'
          : isFarmer && !isMdoc
          ? 'Farmer Verifiable Credential'
          : isMdoc
          ? 'Mobile Driving License'
          : 'Playground Identity Credential'
      const logo = isFarmer
        ? 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png'
        : 'https://api.collab.mosip.net/inji/mosip-logo.png'

      const metadata = JSON.stringify({
        issuerId: actualIssuer,
        issuer: actualIssuer,
        credentialType: actualCredType,
        credentialConfigurationId: actualCredType,
        credentialTypeDisplayName: displayName,
        credentialTypeLogo: logo,
        format,
      })
      await client.query(
        `INSERT INTO public.verifiable_credentials (id, wallet_id, credential, credential_metadata, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())`,
        [credId, walletId, compactCred, metadata]
      )
      console.log(`[wallet-bridge] Inserted new ${actualCredType} ${credId} into wallet ${walletId}`)
    }

    return { credentialId: credId }
  } finally {
    await client.end().catch(() => {})
  }
}

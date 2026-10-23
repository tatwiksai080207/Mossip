import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  generateFarmerCredentialPdf,
  generateDrivingLicencePdf,
  generateIdentityCredentialPdf,
  parseCredentialClaims,
} from '../server/routes/mimoto/pdf-generator'
import { enrichMimotoProperties } from '../server/routes/mimoto/properties'

describe('Mimoto Properties Enrichment (Issue #10)', () => {
  it('should enrich raw container properties with dynamic tunnel and mobile safety flags', () => {
    const rawProperties = {
      allowedInternalAuthType: 'otp,bio-Finger',
      warningDomainName: 'http://localhost:8099',
      webUrl: 'http://localhost:3004',
    }

    const tunnelUrl = 'https://populace-viscosity-suitable.ngrok-free.dev/'
    const enriched = enrichMimotoProperties(rawProperties, tunnelUrl)

    assert.strictEqual(
      enriched.warningDomainName,
      'https://populace-viscosity-suitable.ngrok-free.dev',
      'Should strip trailing slash and inject dynamic public tunnel URL'
    )
    assert.strictEqual(enriched.cacheTTLInMilliSeconds, '1', 'Should enforce instant cache invalidation')
    assert.strictEqual(enriched.openid4vpClientValidation, 'true', 'Should enable OpenID4VP verifier validation')
    assert.strictEqual(enriched.disableCredentialOfferVcVerification, true, 'Should bypass Root CA check for sandbox')
    assert.strictEqual(enriched.allowedInternalAuthType, 'otp,bio-Finger', 'Should preserve existing container properties')
  })

  it('should fallback gracefully when tunnel URL is empty', () => {
    const rawProperties = {
      warningDomainName: 'http://localhost:8099',
    }
    const enriched = enrichMimotoProperties(rawProperties, '')
    assert.strictEqual(enriched.warningDomainName, 'http://localhost:8099')
  })
})

describe('Dynamic Credential PDF Generation & Claim Extraction (Issue #9)', () => {
  it('should extract claims from JSON-LD credentialSubject', () => {
    const jsonLd = JSON.stringify({
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'FarmerCredential'],
      issuer: 'did:key:z6MkiMWcKioLxB',
      credentialSubject: {
        fullName: 'James Rodrigious',
        farmerID: '8267411578',
        mobileNumber: '8765432109',
        dateOfBirth: '12-11-1985',
        gender: 'Male',
        state: 'Uttar Pradesh',
        district: 'Lucknow',
        landArea: '2.5 acres',
      },
      issuanceDate: '2026-10-23T00:00:00Z',
    })

    const claims = parseCredentialClaims(jsonLd)
    assert.strictEqual(claims.fullName, 'James Rodrigious')
    assert.strictEqual(claims.farmerID, '8267411578')
    assert.strictEqual(claims.state, 'Uttar Pradesh')
    assert.strictEqual(claims.landArea, '2.5 acres')
  })

  it('should generate a mathematically valid PDF 1.4 Buffer for Farmer Verifiable Credential', () => {
    const pdf = generateFarmerCredentialPdf({
      fullName: 'James Rodrigious',
      farmerId: '8267411578',
      dob: '12-11-1985',
      gender: 'Male',
      state: 'Uttar Pradesh',
      district: 'Lucknow',
      landArea: '2.5 acres (Tenant)',
      formatLabel: 'W3C Verifiable Credential 2.0 (JSON-LD)',
    })

    assert.ok(Buffer.isBuffer(pdf), 'Must return a Buffer')
    assert.ok(pdf.length > 500, 'PDF length must be substantial')

    const pdfString = pdf.toString('utf-8')
    assert.ok(pdfString.startsWith('%PDF-1.4'), 'Must start with PDF 1.4 header')
    assert.ok(pdfString.includes('trailer'), 'Must include trailer block')
    assert.ok(pdfString.includes('startxref'), 'Must include startxref pointer')
    assert.ok(pdfString.includes('%%EOF'), 'Must terminate with %%EOF')
    assert.ok(pdfString.includes('James Rodrigious'), 'Must dynamically contain the citizen holder name')
    assert.ok(pdfString.includes('8267411578'), 'Must dynamically contain the citizen farmer ID')
    assert.ok(pdfString.includes('Uttar Pradesh'), 'Must contain state information')
  })

  it('should generate an ISO 18013-5 Mobile Driving License PDF with mDoc headers', () => {
    const pdf = generateDrivingLicencePdf({
      fullName: 'Jane Thompson',
      docNumber: 'DL-KA-2026-998877',
      state: 'Karnataka',
      vehicleClass: 'LMV, MCWG',
      formatLabel: 'ISO/IEC 18013-5 (mDoc / mDL)',
    })

    const pdfString = pdf.toString('utf-8')
    assert.ok(pdfString.startsWith('%PDF-1.4'), 'Must be valid PDF 1.4')
    assert.ok(pdfString.includes('MOBILE DRIVING LICENCE'), 'Must contain mDL header')
    assert.ok(pdfString.includes('Jane Thompson'), 'Must contain dynamic driver name')
    assert.ok(pdfString.includes('DL-KA-2026-998877'), 'Must contain dynamic license number')
    assert.ok(pdfString.includes('ISO/IEC 18013-5'), 'Must contain format label')
  })

  it('should generate a National Identity Credential PDF with proper format badges', () => {
    const pdf = generateIdentityCredentialPdf('PlaygroundIdentityCredential_SD_JWT', {
      fullName: 'Gorge Cooper',
      docNumber: '2154189532',
      region: 'Karnataka',
    })

    const pdfString = pdf.toString('utf-8')
    assert.ok(pdfString.startsWith('%PDF-1.4'), 'Must be valid PDF 1.4')
    assert.ok(pdfString.includes('NATIONAL DIGITAL IDENTITY CREDENTIAL'), 'Must contain identity title')
    assert.ok(pdfString.includes('Gorge Cooper'), 'Must contain holder name')
    assert.ok(pdfString.includes('IETF SD-JWT VC'), 'Must contain SD-JWT format badge')
  })
})

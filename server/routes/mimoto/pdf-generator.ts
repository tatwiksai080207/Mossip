export function generateDrivingLicencePdf(details?: { docNumber?: string; name?: string }): Buffer {
  const docNum = details?.docNumber || 'DL-5720110023456'
  const holderName = details?.name || 'Asha Raghunathan'
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 20 Tf
100 700 Td
(Playground Driving Licence) Tj
/F1 12 Tf
0 -30 Td
(Document Number: ${docNum}) Tj
0 -20 Td
(Name: ${holderName}) Tj
0 -20 Td
(Issuing Authority: Karnataka Transport Department) Tj
0 -20 Td
(Format: ISO/IEC 18013-5 mDoc / mDL) Tj
0 -20 Td
(Status: Verified & Valid) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000555 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
630
%%EOF`
  return Buffer.from(content)
}

export function generateIdentityCredentialPdf(
  credType: string,
  details?: { name?: string; dob?: string; gender?: string; region?: string }
): Buffer {
  const name = details?.name || 'Asha Raghunathan'
  const dob = details?.dob || '1991-07-14'
  const gender = details?.gender || 'Female'
  const region = details?.region || 'Karnataka'

  let formatLabel = 'W3C Verifiable Credential 1.1'
  if (credType.includes('2.0') || credType.includes('VCDM2.0')) {
    formatLabel = 'W3C Verifiable Credential 2.0'
  } else if (credType.includes('SDJWT') || credType.includes('sd-jwt')) {
    formatLabel = 'IETF SD-JWT VC'
  }

  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 280 >> stream
BT
/F1 20 Tf
100 700 Td
(Playground Identity Credential) Tj
/F1 12 Tf
0 -30 Td
(Name: ${name}) Tj
0 -20 Td
(Date of Birth: ${dob}) Tj
0 -20 Td
(Gender: ${gender}) Tj
0 -20 Td
(Region: ${region}) Tj
0 -20 Td
(Format: ${formatLabel}) Tj
0 -20 Td
(Status: Verified & Valid) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000575 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
650
%%EOF`
  return Buffer.from(content)
}

export function generateFarmerCredentialPdf(details?: {
  name?: string
  farmerId?: string
  dob?: string
  gender?: string
  mobile?: string
  state?: string
  district?: string
  landArea?: string
  formatLabel?: string
}): Buffer {
  const name = details?.name || 'Gorge Cooper'
  const farmerId = details?.farmerId || '2154189532'
  const dob = details?.dob || '25-05-1990'
  const gender = details?.gender || 'Male'
  const mobile = details?.mobile || '9876543210'
  const state = details?.state || 'Karnataka'
  const district = details?.district || 'Bangalore'
  const landArea = details?.landArea || '3 hectares (Owner)'
  const formatLabel = details?.formatLabel || 'W3C Verifiable Credential - JSON-LD'

  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 340 >> stream
BT
/F1 20 Tf
100 700 Td
(Farmer Verifiable Credential) Tj
/F1 12 Tf
0 -30 Td
(Farmer ID: ${farmerId}) Tj
0 -20 Td
(Name: ${name}) Tj
0 -20 Td
(Date of Birth: ${dob}) Tj
0 -20 Td
(Gender: ${gender}) Tj
0 -20 Td
(Mobile: ${mobile}) Tj
0 -20 Td
(State: ${state} - District: ${district}) Tj
0 -20 Td
(Land Area: ${landArea}) Tj
0 -20 Td
(Issuing Authority: Agriculture Department) Tj
0 -20 Td
(Format: ${formatLabel}) Tj
0 -20 Td
(Status: Verified & Valid) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000635 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
710
%%EOF`
  return Buffer.from(content)
}

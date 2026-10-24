import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import defaultIdentities from './identities.json'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ResidentIdentity {
  uin: string
  fullName: string
  dateOfBirth: string
  gender: string
  phone: string
}

export interface FarmerIdentity {
  farmerId: string
  fullName: string
  mobileNumber: string
  dateOfBirth: string
  gender: string
  state: string
  district: string
  villageOrTown: string
  postalCode: string
  landArea: string
  landOwnershipType: string
  primaryCrop: string
  secondaryCrop: string
}

export interface DrivingLicenseIdentity {
  documentNumber: string
  familyName: string
  givenName: string
  birthDate: string
  issueDate: string
  expiryDate: string
  issuingCountry: string
  issuingAuthority: string
  drivingPrivileges: string
}

export interface IdentitiesConfig {
  resident: ResidentIdentity
  farmer: FarmerIdentity
  drivingLicense: DrivingLicenseIdentity
}

function loadIdentities(): IdentitiesConfig {
  let loaded: IdentitiesConfig = { ...defaultIdentities }

  // Check for local overrides file (never committed to git)
  const localPath = path.join(__dirname, 'identities.local.json')
  if (fs.existsSync(localPath)) {
    try {
      const raw = fs.readFileSync(localPath, 'utf8')
      const parsed = JSON.parse(raw)
      loaded = {
        ...loaded,
        ...parsed,
        resident: { ...loaded.resident, ...(parsed.resident || {}) },
        farmer: { ...loaded.farmer, ...(parsed.farmer || {}) },
        drivingLicense: { ...loaded.drivingLicense, ...(parsed.drivingLicense || {}) },
      }
    } catch (err) {
      console.warn('[identities] Failed to parse identities.local.json, using defaults:', err)
    }
  }

  // Allow environment variable overrides
  if (process.env.RESIDENT_UIN) {
    loaded.resident.uin = process.env.RESIDENT_UIN
  }
  if (process.env.RESIDENT_FULL_NAME) {
    loaded.resident.fullName = process.env.RESIDENT_FULL_NAME
  }
  if (process.env.RESIDENT_PHONE) {
    loaded.resident.phone = process.env.RESIDENT_PHONE
  }

  return loaded
}

export const identities: IdentitiesConfig = loadIdentities()
export default identities

export function getResidentIdentity(): ResidentIdentity {
  return loadIdentities().resident
}

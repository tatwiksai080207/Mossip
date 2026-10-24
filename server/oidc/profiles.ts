// Authentic Farmer Identities from mosip-stack/config/farmer_identity_data.csv
export interface FarmerProfile {
  id: string
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
  primaryCropType: string
  secondaryCropType: string
  farmerID: string
}

export const FARMER_IDENTITIES: Record<string, FarmerProfile> = {
  '2154189532': {
    id: '2154189532',
    fullName: 'Gorge Cooper',
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
    farmerID: '987654321',
  },
  '8267411578': {
    id: '8267411578',
    fullName: 'James Rodrigious',
    mobileNumber: '8765432109',
    dateOfBirth: '12-11-1985',
    gender: 'Male',
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    villageOrTown: 'Gomti Nagar',
    postalCode: '226010',
    landArea: '2.5 acres',
    landOwnershipType: 'Tenant',
    primaryCropType: 'Rice',
    secondaryCropType: 'Wheat',
    farmerID: '123456789',
  },
  '5860356276': {
    id: '5860356276',
    fullName: 'Jane Thompson',
    mobileNumber: '7550166914',
    dateOfBirth: '24-01-1998',
    gender: 'Female',
    state: 'Karnataka',
    district: 'Bangalore',
    villageOrTown: 'Koramangala',
    postalCode: '560068',
    landArea: '5 acres',
    landOwnershipType: 'Self-owned',
    primaryCropType: 'Cotton',
    secondaryCropType: 'Barley',
    farmerID: '4567538771',
  },
}

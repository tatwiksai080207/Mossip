import type { IssuerConfig, WalletConfig, VerifierConfig } from './types'
import matrixData from './config/matrix.json'
import appLinksData from './config/app-links.json'

/**
 * 3-Column matrix configuration loaded dynamically from JSON config.
 * Anyone can edit src/config/matrix.json or app-links.json without touching TypeScript logic.
 */
export const issuers: IssuerConfig[] = matrixData.issuers as IssuerConfig[]
export const wallets: WalletConfig[] = matrixData.wallets as WalletConfig[]
export const verifiers: VerifierConfig[] = matrixData.verifiers as VerifierConfig[]

export const appLinks = appLinksData

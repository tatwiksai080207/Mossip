import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AppError, formatProblemDetails } from '../server/errors'

describe('Diagnostics and RFC 7807 Error Normalization', () => {
  it('should instantiate AppError with code and status', () => {
    const err = new AppError('Invalid proof signature', 400, 'ERR_INVALID_PROOF', { proof: 'corrupted' })
    assert.equal(err.message, 'Invalid proof signature')
    assert.equal(err.statusCode, 400)
    assert.equal(err.errorCode, 'ERR_INVALID_PROOF')
    assert.deepEqual(err.details, { proof: 'corrupted' })
  })

  it('should format AppError into RFC 7807 Problem Details JSON', () => {
    const err = new AppError('Holder binding key mismatch', 400, 'ERR_HOLDER_BINDING')
    const problem = formatProblemDetails(err, '/api/wallet/present')

    assert.equal(problem.status, 400)
    assert.equal(problem.errorCode, 'ERR_HOLDER_BINDING')
    assert.equal(problem.detail, 'Holder binding key mismatch')
    assert.equal(problem.type, 'https://inji.mosip.io/errors/err-holder-binding')
    assert.equal(problem.instance, '/api/wallet/present')
    assert.ok(problem.timestamp)
  })

  it('should normalize standard unhandled Error into 500 Problem Details', () => {
    const genericErr = new Error('Database connection reset by peer')
    const problem = formatProblemDetails(genericErr, '/api/mimoto/credentials/download')

    assert.equal(problem.status, 500)
    assert.equal(problem.errorCode, 'ERR_UNHANDLED_EXCEPTION')
    assert.equal(problem.detail, 'Database connection reset by peer')
    assert.equal(problem.instance, '/api/mimoto/credentials/download')
    assert.ok(problem.timestamp)
  })

  it('should normalize primitive strings into 500 Problem Details', () => {
    const problem = formatProblemDetails('Something broke unexpectedly', '/api/test')
    assert.equal(problem.status, 500)
    assert.equal(problem.detail, 'Something broke unexpectedly')
  })
})

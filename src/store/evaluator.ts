import type { FlowStepInfo } from '../types'

export interface EvaluationResult {
  passed: boolean
  message: string
}

export function evaluateTestRun(steps: FlowStepInfo[], tamperMode: string): EvaluationResult {
  const allDone = steps.every(s => s.status === 'done' || (s.status === 'pending' && s.payload && (s.payload as any)._note))
  
  if (tamperMode === 'none') {
    return {
      passed: allDone,
      message: allDone 
        ? 'All steps completed successfully.' 
        : `${steps.filter(s => s.status === 'done').length}/${steps.length} steps passed, ${steps.filter(s => s.status === 'error').length} failed.`
    }
  }

  if (tamperMode === 'signature') {
    const verificationStep = steps.find(s => s.id === 'verification')
    if (verificationStep && verificationStep.status === 'error') {
      return {
        passed: true,
        message: 'Negative Test Passed: Verifier successfully rejected the corrupt signature.'
      }
    }
    if (allDone) {
      return {
        passed: false,
        message: 'Negative Test Failed: Verifier incorrectly accepted the corrupt signature!'
      }
    }
    return {
      passed: false,
      message: 'Negative Test Failed: Flow failed before the verification step could check the signature.'
    }
  }

  if (tamperMode === 'expired') {
    const vpResponseStep = steps.find(s => s.id === 'vp-response')
    if (vpResponseStep && vpResponseStep.status === 'error') {
       const payload = vpResponseStep.payload as any
       if (payload && payload._http_status === 400) {
         return {
           passed: true,
           message: 'Negative Test Passed: Verifier successfully rejected the malformed token at submission (HTTP 400).'
         }
       }
       return {
         passed: true,
         message: 'Negative Test Passed: Verifier rejected the malformed token.'
       }
    }
    if (allDone) {
      return {
         passed: false,
         message: 'Negative Test Failed: Verifier incorrectly accepted the malformed token!'
      }
    }
    return {
      passed: false,
      message: 'Negative Test Failed: Flow failed upstream for an unexpected reason.'
    }
  }

  return { passed: false, message: 'Unknown test condition.' }
}

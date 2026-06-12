/**
 * sdk-smoke — Quick Pi SDK import-time verification.
 *
 * Runs during app startup (app.on('ready') setup) to confirm the SDK
 * is importable. Logs a warning if unavailable but does NOT block
 * app initialization or the subprocess-Pi fallback path.
 */

let verified = false
let error: string | null = null

export async function verifyPiSdkAvailable(): Promise<boolean> {
  if (verified) return true

  try {
    // Verify the three key packages our Pi host code depends on
    const core = await import('@earendil-works/pi-agent-core')
    const ai = await import('@earendil-works/pi-ai')
    const node = await import('@earendil-works/pi-agent-core/node')

    const checks = [
      typeof core.Agent === 'function',
      typeof core.InMemorySessionRepo === 'function',
      typeof ai.getModel === 'function',
      typeof node.NodeExecutionEnv === 'function',
    ]

    if (checks.every(Boolean)) {
      verified = true
      return true
    }

    error = `SDK exports check failed: ${checks.map((c, i) => `export#${i}=${c}`).join(', ')}`
    return false
  } catch (err) {
    error = `SDK import failed: ${err instanceof Error ? err.message : String(err)}`
    return false
  }
}

export function getPiSdkSmokeError(): string | null {
  return error
}

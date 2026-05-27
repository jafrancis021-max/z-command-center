export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn:           () => Promise<T>,
  label:        string,
  maxAttempts = 3,
  baseDelayMs = 800,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1) + Math.random() * 200
        await sleep(delay)
      }
    }
  }
  throw new Error(
    `${label} failed after ${maxAttempts} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  )
}

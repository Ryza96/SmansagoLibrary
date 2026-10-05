// Recovery attempt limiter — 5 kegagalan berturut-turut → terkunci 15 menit.
// Jam bisa disuntik untuk test.
export class RecoveryAttemptLimiter {
  private failures = 0
  private lockedUntil: Date | null = null

  constructor(private now: () => Date = () => new Date()) {}

  isLocked(): boolean {
    if (!this.lockedUntil) return false
    if (this.now().getTime() >= this.lockedUntil.getTime()) {
      this.lockedUntil = null
      this.failures = 0
      return false
    }
    return true
  }

  // Menit tersisa saat terkunci (0 bila tidak terkunci).
  remainingLockMinutes(): number {
    if (!this.lockedUntil) return 0
    const ms = this.lockedUntil.getTime() - this.now().getTime()
    return ms > 0 ? Math.ceil(ms / 60000) : 0
  }

  recordFailure(): void {
    this.failures++
    if (this.failures >= 5) {
      this.lockedUntil = new Date(this.now().getTime() + 15 * 60 * 1000)
      this.failures = 0
    }
  }

  reset(): void {
    this.failures = 0
    this.lockedUntil = null
  }
}

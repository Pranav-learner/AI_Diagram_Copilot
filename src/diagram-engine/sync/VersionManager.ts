/**
 * Version + scene-signature tracking for echo detection.
 *
 * Complements the lock: after the bridge applies a scene, it records that scene's
 * **signature** (a cheap string). A subsequent canvas change whose signature
 * matches is an echo of our own write and is dropped — even if it arrives outside
 * the lock window. The authoritative guard is still DSL idempotency
 * (`equals`), but the signature check avoids a full parse for the common echo.
 */

export class VersionManager {
  private appliedSignature: string | null = null;
  private version = 0;

  /** Monotonic runtime version. */
  bump(): number {
    return (this.version += 1);
  }

  get current(): number {
    return this.version;
  }

  /** Record the signature of the scene we just applied to the canvas. */
  markApplied(signature: string): void {
    this.appliedSignature = signature;
  }

  /** True if `signature` matches the last scene we applied (i.e. an echo). */
  isEcho(signature: string): boolean {
    return this.appliedSignature !== null && this.appliedSignature === signature;
  }

  reset(): void {
    this.appliedSignature = null;
  }
}

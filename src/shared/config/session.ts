// Parameter session admin AUTH-7 (RFC_AUTH_SESSION_PERSISTENCE.md — Opsi A, disetujui PO).
// Leaf node tanpa import — kontrak lintas main/renderer (pola config auth.ts / academic-status.ts).

// Token = opaque random bytes (bukan JWT). Panjang 32 byte → base64url ~43 karakter.
export const SESSION_CONFIG = {
  tokenBytes: 32,
  // TTL absolute (keputusan PO): session valid 24 jam dari login; lewat → wajib login ulang.
  ttlHours: 24
} as const

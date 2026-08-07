// Kebijakan password & parameter Argon2id AUTH v1 (RFC_AUTH_ARCHITECTURE.md §11.6/§11.1).
// Leaf node tanpa import — kontrak lintas main/renderer (pola config domain
// academic-status.ts / member-type.ts).

// REV-3: minimal 8 karakter, maksimal 128 karakter; TANPA syarat kompleksitas
// (huruf besar/angka/simbol) di v1 — kompleksitas = backlog AUTH berikutnya.
export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128
} as const

// OWASP rec. Argon2id (RFC §11.1): 64 MiB, 3 iterasi, 1 thread, output 32 byte.
export const ARGON2_PARAMS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32
} as const

// Algoritma Argon2id = 2 pada @node-rs/argon2. Library men-declare `const enum
// Algorithm` yang TIDAK dapat direferensikan saat isolatedModules aktif (TS2748)
// → gunakan nilai numerik literal.
export const ARGON2_ALGORITHM_ID = 2 as const

// Versi PHC Argon2 (v=19). Digunakan needsRehash untuk deteksi hash lawas.
export const ARGON2_VERSION = 19 as const

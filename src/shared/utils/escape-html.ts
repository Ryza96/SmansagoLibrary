// Escape HTML untuk konten laporan yang dicetak (TAHAP 1 = fondasi data;
// dipakai template HTML pada TAHAP 2). Util BARU — TIDAK mengubah
// escapeHtml lama di borrow-card.service.ts / collective-borrow-card.service.ts /
// label.service.ts (file-file itu tidak disentuh WO ini).
// Murni, tanpa dependensi renderer/main.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

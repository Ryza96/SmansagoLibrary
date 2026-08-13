export const TEACHER_IMPORT_MESSAGES: Record<string, string> = {
  'teacherImport.requiredValue': 'Wajib diisi',
  'teacherImport.invalidGender': 'Jenis kelamin tidak valid (gunakan L / Laki-laki atau P / Perempuan)',
  'teacherImport.invalidDate': 'Tanggal lahir tidak valid',
  'teacherImport.duplicateNipInFile': 'NIP duplikat dalam file',
  'teacherImport.duplicateNipInDb': 'NIP sudah terdaftar di database'
}

export function teacherImportMessage(messageKey: string): string {
  return TEACHER_IMPORT_MESSAGES[messageKey] ?? messageKey
}

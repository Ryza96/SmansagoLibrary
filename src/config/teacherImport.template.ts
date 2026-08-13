export type TeacherImportColumnKey =
  | 'nama'
  | 'jenisKelamin'
  | 'nip'
  | 'tempatLahir'
  | 'tanggalLahir'
  | 'alamat'
  | 'whatsapp'
  | 'email'

export interface TeacherImportColumn {
  key: TeacherImportColumnKey
  label: string
  requiredHeader: boolean
}

export const TEACHER_IMPORT_TEMPLATE: TeacherImportColumn[] = [
  { key: 'nama', label: 'Nama', requiredHeader: true },
  { key: 'jenisKelamin', label: 'Jenis Kelamin', requiredHeader: true },
  { key: 'nip', label: 'NIP', requiredHeader: true },
  { key: 'tempatLahir', label: 'Tempat Lahir', requiredHeader: false },
  { key: 'tanggalLahir', label: 'Tanggal Lahir', requiredHeader: false },
  { key: 'alamat', label: 'Alamat', requiredHeader: false },
  { key: 'whatsapp', label: 'WhatsApp', requiredHeader: false },
  { key: 'email', label: 'Email', requiredHeader: false }
]

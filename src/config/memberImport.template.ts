export type MemberImportColumnKey =
  | 'nama'
  | 'kelas'
  | 'jenisKelamin'
  | 'nisn'
  | 'tempatLahir'
  | 'tanggalLahir'
  | 'alamat'
  | 'whatsapp'
  | 'email'

export interface MemberImportColumn {
  key: MemberImportColumnKey
  label: string
  requiredHeader: boolean
}

export const MEMBER_IMPORT_TEMPLATE: MemberImportColumn[] = [
  { key: 'nama', label: 'Nama', requiredHeader: true },
  { key: 'kelas', label: 'Kelas', requiredHeader: true },
  { key: 'jenisKelamin', label: 'Jenis Kelamin', requiredHeader: true },
  { key: 'nisn', label: 'NISN', requiredHeader: true },
  { key: 'tempatLahir', label: 'Tempat Lahir', requiredHeader: false },
  { key: 'tanggalLahir', label: 'Tanggal Lahir', requiredHeader: false },
  { key: 'alamat', label: 'Alamat', requiredHeader: true },
  { key: 'whatsapp', label: 'No. WhatsApp', requiredHeader: true },
  { key: 'email', label: 'Email', requiredHeader: false },
]

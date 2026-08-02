export const IMPORT_CONFIG = {
  allowedExtensions: ['.xlsx'] as const,
  maxFileSize: 5 * 1024 * 1024,
  minColumns: 1,
  MEMBER_IMPORT_LOOKUP_CHUNK: 900,
  MEMBER_IMPORT_WRITE_CHUNK: 500,
} as const

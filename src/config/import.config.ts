export const IMPORT_CONFIG = {
  allowedExtensions: ['.xlsx'] as const,
  maxFileSize: 5 * 1024 * 1024,
  minColumns: 1,
} as const

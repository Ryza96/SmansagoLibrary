import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ImportErrorCode, ValidatedWorkbook } from '../types/import'

interface BookImportContextValue {
  file: File | null
  errorCode: ImportErrorCode | null
  validatedWorkbook: ValidatedWorkbook | null
  parsing: boolean
  setFile: (file: File | null) => void
  setErrorCode: (code: ImportErrorCode | null) => void
  setValidatedWorkbook: (workbook: ValidatedWorkbook | null) => void
  setParsing: (parsing: boolean) => void
  reset: () => void
}

const BookImportContext = createContext<BookImportContextValue | undefined>(undefined)

export function BookImportProvider({ children }: { children: ReactNode }) {
  const [file, setFileState] = useState<File | null>(null)
  const [errorCode, setErrorCodeState] = useState<ImportErrorCode | null>(null)
  const [validatedWorkbook, setValidatedWorkbookState] = useState<ValidatedWorkbook | null>(null)
  const [parsing, setParsingState] = useState(false)

  const setFile = useCallback((next: File | null) => setFileState(next), [])
  const setErrorCode = useCallback((code: ImportErrorCode | null) => setErrorCodeState(code), [])
  const setValidatedWorkbook = useCallback(
    (next: ValidatedWorkbook | null) => setValidatedWorkbookState(next),
    []
  )
  const setParsing = useCallback((next: boolean) => setParsingState(next), [])
  const reset = useCallback(() => {
    setFileState(null)
    setErrorCodeState(null)
    setValidatedWorkbookState(null)
    setParsingState(false)
  }, [])

  const value = useMemo(
    () => ({
      file,
      errorCode,
      validatedWorkbook,
      parsing,
      setFile,
      setErrorCode,
      setValidatedWorkbook,
      setParsing,
      reset,
    }),
    [file, errorCode, validatedWorkbook, parsing, setFile, setErrorCode, setValidatedWorkbook, setParsing, reset]
  )

  return <BookImportContext.Provider value={value}>{children}</BookImportContext.Provider>
}

export function useBookImport(): BookImportContextValue {
  const context = useContext(BookImportContext)
  if (!context) throw new Error('useBookImport must be used within BookImportProvider')
  return context
}

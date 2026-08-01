import { useCallback, useRef } from 'react'
import type { ImportErrorCode } from '../types/import'
import { validateImportFile } from '../utils/bookImport'
import { workbookReaderService, ImportReaderError } from '../services/WorkbookReaderService'
import { validationEngineService } from '../services/ValidationEngineService'
import { useBookImport } from '../contexts/BookImportContext'

export function useBookImportWorkflow() {
  const { file, setFile, setErrorCode, setValidatedWorkbook, setParsing } = useBookImport()
  const parseSeq = useRef(0)

  const selectFile = useCallback(
    (next: File | null) => {
      parseSeq.current += 1
      setParsing(false)

      if (!next) {
        setFile(null)
        setErrorCode(null)
        setValidatedWorkbook(null)
        return
      }

      const code: ImportErrorCode | null = validateImportFile(next)
      setFile(next)
      setValidatedWorkbook(null)
      setErrorCode(code)
    },
    [setFile, setErrorCode, setValidatedWorkbook, setParsing]
  )

  const parseAndValidate = useCallback(async (): Promise<boolean> => {
    if (!file) return false
    if (validateImportFile(file)) return false

    const seq = parseSeq.current + 1
    parseSeq.current = seq

    setErrorCode(null)
    setValidatedWorkbook(null)
    setParsing(true)

    try {
      const rawWorkbook = await workbookReaderService.readWorkbook(file)
      if (parseSeq.current !== seq) return false
      setValidatedWorkbook(validationEngineService.validate(rawWorkbook))
      return true
    } catch (err: unknown) {
      if (parseSeq.current !== seq) return false
      setValidatedWorkbook(null)
      setErrorCode(err instanceof ImportReaderError ? err.code : 'IMP-004')
      return false
    } finally {
      if (parseSeq.current === seq) setParsing(false)
    }
  }, [file, setErrorCode, setValidatedWorkbook, setParsing])

  return { selectFile, parseAndValidate }
}

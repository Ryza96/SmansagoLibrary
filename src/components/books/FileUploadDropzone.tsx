import { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, RefreshCw, Trash2 } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { formatFileSize } from '../../utils/bookImport'
import { IMPORT_CONFIG } from '../../config/import.config'

interface FileUploadDropzoneProps {
  file: File | null
  onFileChange: (file: File | null) => void
}

export default function FileUploadDropzone({ file, onFileChange }: FileUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const [dragActive, setDragActive] = useState(false)

  function handleFiles(files: FileList | null) {
    const selectedFile = files && files.length > 0 ? files[0] : null
    if (inputRef.current) inputRef.current.value = ''
    onFileChange(selectedFile)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragCounter.current = 0
    setDragActive(false)
    handleFiles(event.dataTransfer.files)
  }

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <FileSpreadsheet size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
          <p className="text-xs text-slate-500">
            {formatFileSize(file.size)} · {IMPORT_CONFIG.allowedExtensions.join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            title={LABELS.IMPORT.REPLACE}
          >
            <RefreshCw size={16} />
            {LABELS.IMPORT.REPLACE}
          </button>
          <button
            onClick={() => onFileChange(null)}
            className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            title={LABELS.IMPORT.REMOVE}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_CONFIG.allowedExtensions.join(',')}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    )
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        dragCounter.current += 1
        setDragActive(true)
      }}
      onDragLeave={() => {
        dragCounter.current -= 1
        if (dragCounter.current === 0) setDragActive(false)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        dragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'
      }`}
    >
      <UploadCloud size={40} className={dragActive ? 'text-blue-500' : 'text-slate-400'} />
      <p className="mt-2 text-sm font-medium text-slate-700">{LABELS.IMPORT.DROPZONE_TITLE}</p>
      <p className="text-sm text-slate-500">{LABELS.IMPORT.DROPZONE_HINT}</p>
      <p className="mt-2 text-xs text-slate-400">
        {LABELS.IMPORT.FORMAT} · {LABELS.IMPORT.MAX_SIZE_PREFIX}{' '}
        {formatFileSize(IMPORT_CONFIG.maxFileSize)}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_CONFIG.allowedExtensions.join(',')}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}

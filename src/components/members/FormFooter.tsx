import { LABELS } from '../../utils/labels'

interface FormFooterProps {
  isEditMode: boolean
  onCancel: () => void
  onSaveDraft: () => void
}

export default function FormFooter({ isEditMode, onCancel, onSaveDraft }: FormFooterProps) {
  return (
    <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
      <button
        type="button"
        onClick={onCancel}
        className="px-5 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
      >
        {LABELS.MEMBER.CANCEL}
      </button>
      {!isEditMode && (
        <button
          type="button"
          onClick={onSaveDraft}
          className="px-5 py-2 border border-blue-200 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
        >
          {LABELS.MEMBER.SAVE_DRAFT}
        </button>
      )}
      <button
        type="submit"
        className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        {isEditMode ? LABELS.MEMBER.SAVE_CHANGES : LABELS.MEMBER.SAVE}
      </button>
    </div>
  )
}

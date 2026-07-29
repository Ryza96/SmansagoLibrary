import { LABELS } from '../../constants/labels'
import Section from './Section'

interface NotesSectionProps {
  notes: string
  setNotes: (v: string) => void
}

export default function NotesSection({ notes, setNotes }: NotesSectionProps) {
  return (
    <Section title={LABELS.MEMBER_SECTION.NOTES}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="block text-sm font-medium text-slate-700">{LABELS.FIELD.NOTES}</label>
          <span className="text-xs text-slate-400">({LABELS.OPTIONAL})</span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => {
            if (e.target.value.length <= 1000) setNotes(e.target.value)
          }}
          rows={3}
          placeholder={LABELS.PLACEHOLDER.MEMBER_NOTES}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex justify-end mt-1">
          <span className={`text-xs ${notes.length > 800 ? 'text-amber-500' : 'text-slate-400'}`}>
            {notes.length}/1000
          </span>
        </div>
      </div>
    </Section>
  )
}

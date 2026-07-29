export default function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-5">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

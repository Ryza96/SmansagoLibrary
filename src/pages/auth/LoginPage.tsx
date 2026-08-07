import { LABELS } from '../../utils/labels'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.AUTH.APP_NAME}</h1>
        <h2 className="text-lg font-semibold text-slate-700 mt-4">{LABELS.AUTH.LOGIN_TITLE}</h2>
        <p className="text-sm text-slate-500 mt-2">{LABELS.AUTH.LOGIN_COMING_SOON}</p>
      </div>
    </div>
  )
}

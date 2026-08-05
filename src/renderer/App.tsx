import { RouterProvider } from 'react-router-dom'
import { NotificationProvider } from '../notification/NotificationContext'
import { router } from '../routes'

export default function App() {
  return (
    <NotificationProvider>
      <RouterProvider router={router} />
    </NotificationProvider>
  )
}

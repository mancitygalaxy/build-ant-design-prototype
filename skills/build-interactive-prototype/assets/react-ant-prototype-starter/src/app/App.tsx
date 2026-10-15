import { ConfigProvider } from 'antd'
import { HomePage } from '../pages/HomePage'

export function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: '#1677ff',
          fontSize: 14,
        },
      }}
    >
      <HomePage />
    </ConfigProvider>
  )
}


interface ElectronAPI {
  showNotification: (title: string, body: string) => void
  getAppVersion: () => Promise<string>
}

interface Window {
  electronAPI?: ElectronAPI
}

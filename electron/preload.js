const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body })
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
})

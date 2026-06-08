const { Notification } = require('electron')

function registerNotificationIPC(ipcMain) {
  ipcMain.on('show-notification', (_event, { title, body }) => {
    const notification = new Notification({ title, body })
    notification.show()
  })

  ipcMain.handle('get-app-version', () => {
    return require('../package.json').version
  })
}

module.exports = { registerNotificationIPC }

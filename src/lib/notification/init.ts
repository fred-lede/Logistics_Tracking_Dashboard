import { notificationRegistry } from './registry'
import { teamsProvider } from './providers/teams'
import { telegramProvider } from './providers/telegram'
import { wechatProvider } from './providers/wechat'
import { whatsappProvider } from './providers/whatsapp'
import { whatsappWebProvider } from './providers/whatsapp-web'
import { startScheduler } from './scheduler'

const GLOBAL_KEY = '__fedex_notif_init'

export function initNotifications() {
  const g = globalThis as Record<string, unknown>
  if (g[GLOBAL_KEY]) return
  g[GLOBAL_KEY] = true

  notificationRegistry.registerProvider(teamsProvider)
  notificationRegistry.registerProvider(telegramProvider)
  notificationRegistry.registerProvider(wechatProvider)
  notificationRegistry.registerProvider(whatsappProvider)
  notificationRegistry.registerProvider(whatsappWebProvider)

  startScheduler()
}

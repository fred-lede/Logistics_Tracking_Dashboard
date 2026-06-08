export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initNotifications } = await import('@/lib/notification/init')
    initNotifications()
  }
}

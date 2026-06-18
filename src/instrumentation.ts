export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initNotifications } = await import('@/lib/notification/init')
      initNotifications()
    } catch {
      // Scheduler init failure should not crash the server
    }
  }
}

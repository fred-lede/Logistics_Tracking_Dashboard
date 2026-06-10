import { networkInterfaces } from 'node:os'

export function getLanIPv4Addresses() {
  return Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address)
}

export function buildServerUrls(port: number, lanAddresses = getLanIPv4Addresses()) {
  return [
    `http://localhost:${port}`,
    ...lanAddresses.map((address) => `http://${address}:${port}`),
  ]
}

const SOUND_KEY = 'tv-alert-sound'

const BUILTIN_FILES: Record<string, string> = {
  'builtin-ding': '/sounds/ding.mp3',
  'builtin-chime': '/sounds/chime.mp3',
  'builtin-alert': '/sounds/alert.mp3',
}

export type SoundId = 'off' | keyof typeof BUILTIN_FILES | 'webaudio-ding' | 'webaudio-double' | 'webaudio-chime' | 'webaudio-alert' | 'webaudio-success'

export function getSoundId(): SoundId {
  if (typeof window === 'undefined') return 'off'
  const stored = localStorage.getItem(SOUND_KEY)
  if (stored === 'off') return 'off'
  if (stored === 'builtin-ding' || stored === 'builtin-chime' || stored === 'builtin-alert') return stored
  if (stored === 'webaudio-ding' || stored === 'webaudio-double' || stored === 'webaudio-chime' || stored === 'webaudio-alert' || stored === 'webaudio-success') return stored
  if (stored === 'builtin') return 'builtin-ding'
  if (stored === 'webaudio') return 'webaudio-ding'
  return 'builtin-ding'
}

let audioElement: HTMLAudioElement | null = null
let audioContext: AudioContext | null = null

function playBuiltin(sound: string) {
  const src = BUILTIN_FILES[sound]
  if (!src) return
  if (!audioElement || !audioElement.src.endsWith(src)) {
    audioElement = new Audio(src)
  }
  audioElement.currentTime = 0
  audioElement.play().catch(() => {})
}

function playTone(ctx: AudioContext, freq: number, duration: number, startTime: number, volume = 0.3) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01)
  gain.gain.linearRampToValueAtTime(0, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

function playWebAudio(pattern: string) {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  const ctx = audioContext
  const now = ctx.currentTime

  switch (pattern) {
    case 'webaudio-ding':
      playTone(ctx, 880, 0.2, now)
      break
    case 'webaudio-double':
      playTone(ctx, 880, 0.15, now)
      playTone(ctx, 880, 0.15, now + 0.2)
      break
    case 'webaudio-chime':
      playTone(ctx, 523, 0.15, now)
      playTone(ctx, 659, 0.15, now + 0.15)
      playTone(ctx, 784, 0.3, now + 0.3)
      break
    case 'webaudio-alert':
      for (let i = 0; i < 4; i++) {
        playTone(ctx, 660, 0.08, now + i * 0.12, 0.4)
      }
      break
    case 'webaudio-success':
      playTone(ctx, 523, 0.12, now)
      playTone(ctx, 659, 0.12, now + 0.12)
      playTone(ctx, 784, 0.25, now + 0.24)
      break
  }
}

export function playAlertSound(soundId?: SoundId) {
  const id = soundId ?? getSoundId()
  if (id === 'off') return
  if (id.startsWith('builtin-')) {
    playBuiltin(id)
  } else {
    playWebAudio(id)
  }
}

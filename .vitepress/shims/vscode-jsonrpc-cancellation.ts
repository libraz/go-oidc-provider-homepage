type Disposable = {
  dispose(): void
}

type CancellationListener = () => void

const noneEvent = (): Disposable => ({ dispose() {} })

export interface CancellationToken {
  readonly isCancellationRequested: boolean
  readonly onCancellationRequested: (listener: CancellationListener) => Disposable
}

class Emitter {
  #listeners = new Set<CancellationListener>()

  get event() {
    return (listener: CancellationListener): Disposable => {
      this.#listeners.add(listener)
      return {
        dispose: () => this.#listeners.delete(listener)
      }
    }
  }

  fire() {
    for (const listener of this.#listeners) listener()
  }

  dispose() {
    this.#listeners.clear()
  }
}

class MutableToken implements CancellationToken {
  #isCancelled = false
  #emitter?: Emitter

  cancel() {
    if (this.#isCancelled) return
    this.#isCancelled = true
    this.#emitter?.fire()
    this.dispose()
  }

  get isCancellationRequested() {
    return this.#isCancelled
  }

  get onCancellationRequested() {
    if (this.#isCancelled) {
      return (listener: CancellationListener): Disposable => {
        const timer = setTimeout(listener, 0)
        return { dispose: () => clearTimeout(timer) }
      }
    }
    this.#emitter ??= new Emitter()
    return this.#emitter.event
  }

  dispose() {
    this.#emitter?.dispose()
    this.#emitter = undefined
  }
}

const none = Object.freeze({
  isCancellationRequested: false,
  onCancellationRequested: noneEvent
})

const cancelled = Object.freeze({
  isCancellationRequested: true,
  onCancellationRequested: noneEvent
})

export const CancellationToken = {
  None: none,
  Cancelled: cancelled,
  is(value: unknown): value is CancellationToken {
    const candidate = value as Partial<CancellationToken> | undefined
    return (
      candidate === none ||
      candidate === cancelled ||
      (typeof candidate?.isCancellationRequested === 'boolean' &&
        typeof candidate.onCancellationRequested === 'function')
    )
  }
}

export class CancellationTokenSource {
  #token?: CancellationToken | MutableToken

  get token() {
    this.#token ??= new MutableToken()
    return this.#token
  }

  cancel() {
    if (!this.#token) {
      this.#token = cancelled
    } else if (this.#token instanceof MutableToken) {
      this.#token.cancel()
    }
  }

  dispose() {
    if (!this.#token) {
      this.#token = none
    } else if (this.#token instanceof MutableToken) {
      this.#token.dispose()
    }
  }
}

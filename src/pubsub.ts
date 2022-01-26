import { randomUUID } from 'crypto'
import EventEmitter from 'events'
import { DataSnapshot, getDatabase, Reference, ServerValue } from 'firebase-admin/database'
import { PubSubEngine } from 'graphql-subscriptions'
import LRUCache from 'lru-cache'
import { PubSubAsyncIterator } from './async-iterator'
import { DEFAULT_PATH } from './helpers'

export interface PubSubOptions {
  ref?: Reference
  localCache?: boolean
}

type Handler = (a: DataSnapshot, b?: string | null | undefined) => any
type Listener = (...args: any[]) => void

function * subId (): Generator<number, number> {
  let idx = 0
  while (true) {
    yield idx++
  }
}

export class PubSub implements PubSubEngine {
  readonly ref: Reference
  readonly localCache: LRUCache<string, boolean> | undefined
  readonly ee: EventEmitter | undefined

  private readonly nextSubscriptionId = subId()
  private readonly subscriptions: Map<number, { ref: Reference, topic: string, handler: Handler }> = new Map()

  constructor ({ ref, localCache }: PubSubOptions = {}) {
    this.ref = ref ?? getDatabase().ref(DEFAULT_PATH)

    if (localCache) {
      this.localCache = new LRUCache({
        maxAge: 60
      })
      this.ee = new EventEmitter()
    }
  }

  async publish (topic: string | number, payload: any): Promise<void> {
    const t = topic.toString()
    const id = randomUUID()
    this.ee?.emit(t, payload)
    this.localCache?.set(id, true)
    await this.ref.child(t).child(id).set({ timestamp: ServerValue.TIMESTAMP, payload })
  }

  async subscribe (topic: string | number, onMessage: Listener, options: Object): Promise<number> {
    const t = topic.toString()
    const handler = (snapshot: DataSnapshot) => {
      if (this.localCache?.has(snapshot.key!)) return
      onMessage(snapshot.val()?.payload)
    }
    const subId = this.nextSubscriptionId.next().value
    const ref = this.ref.child(t)
    ref.on('child_added', handler)
    this.ee?.addListener(t, onMessage)

    this.subscriptions.set(subId, { ref, topic: t, handler })

    return subId
  }

  async unsubscribe (subId: number) {
    const sub = this.subscriptions.get(subId)

    if (!sub) return

    sub.ref.off('child_added', sub.handler)
    this.ee?.off(sub.topic, sub.handler)
  }

  public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    return new PubSubAsyncIterator<T>(this, triggers)
  }
}

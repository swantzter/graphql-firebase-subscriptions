import { randomUUID } from 'crypto'
import EventEmitter from 'events'
import { DataSnapshot, getDatabase, Reference } from 'firebase-admin/database'
import { PubSubEngine } from 'graphql-subscriptions'
import LRUCache from 'lru-cache'
import { PubSubAsyncIterator } from './async-iterator'
import { DEFAULT_PATH } from './helpers'

export interface PubSubOptions {
  ref?: Reference
  localCache?: boolean
  onlyNew?: boolean
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
  readonly onlyNew: boolean | undefined
  readonly ee: EventEmitter | undefined

  private readonly nextSubscriptionId = subId()
  private readonly subscriptions: Map<number, { ref: Reference, topic: string, refHandler: Handler, eeHandler: Handler }> = new Map()

  constructor ({ ref, localCache, onlyNew }: PubSubOptions = {}) {
    this.ref = ref ?? getDatabase().ref(DEFAULT_PATH)
    this.onlyNew = onlyNew

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
    await this.ref.child(t).child(id).set({ timestamp: Date.now(), payload })
  }

  async subscribe (topic: string | number, onMessage: Listener, options: Object): Promise<number> {
    const t = topic.toString()
    const refHandler = (snapshot: DataSnapshot) => {
      if (this.localCache?.has(snapshot.key!)) return
      onMessage(snapshot.val()?.payload, snapshot.val()?.timestamp)
    }
    const subId = this.nextSubscriptionId.next().value
    const ref = this.ref.child(t)
    ref.on('child_added', refHandler)
    this.ee?.addListener(t, onMessage)

    this.subscriptions.set(subId, { ref, topic: t, refHandler, eeHandler: onMessage })

    return subId
  }

  async unsubscribe (subId: number) {
    const sub = this.subscriptions.get(subId)

    if (!sub) return

    sub.ref.off('child_added', sub.refHandler)
    this.ee?.off(sub.topic, sub.eeHandler)
  }

  public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    return new PubSubAsyncIterator<T>(this, triggers, this.onlyNew)
  }
}

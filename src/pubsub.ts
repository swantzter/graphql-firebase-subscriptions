import { PubSubEngine } from 'graphql-subscriptions'
import { DataSnapshot, getDatabase, Reference } from 'firebase-admin/database'
import LRUCache from 'lru-cache'
import { PubSubAsyncIterator } from './async-iterator'
import EventEmitter from 'events'
import { randomUUID } from 'crypto'

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
    this.ref = ref ?? getDatabase().ref('/graphql-firebase-subscriptions')

    if (localCache) {
      this.localCache = new LRUCache({
        maxAge: 60
      })
      this.ee = new EventEmitter()
    }
  }

  async publish (topic: string, payload: any): Promise<void> {
    const id = randomUUID()
    this.ee?.emit(topic, payload)
    this.localCache?.set(id, true)
    await this.ref.child(topic).child(id).set(payload)
  }

  async subscribe (topic: string, onMessage: Listener, options: Object): Promise<number> {
    const handler = (snapshot: DataSnapshot) => {
      if (this.localCache?.has(snapshot.key!)) return
      onMessage(snapshot.val())
    }
    const subId = this.nextSubscriptionId.next().value
    const ref = this.ref.child(topic)
    ref.on('child_added', handler)
    this.ee?.addListener(topic, onMessage)

    this.subscriptions.set(subId, { ref, topic, handler })

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

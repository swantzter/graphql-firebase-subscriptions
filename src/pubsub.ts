import { PubSubEngine } from 'graphql-subscriptions'
import { DataSnapshot, getDatabase, Reference } from 'firebase-admin/database'
import { PubSubAsyncIterator } from './async-iterator'

export interface PubSubOptions {
  ref?: Reference
}

type Handler = (a: DataSnapshot, b?: string | null | undefined) => any

function * subId (): Generator<number, number> {
  let idx = 0
  while (true) {
    yield idx++
  }
}

export class PubSub implements PubSubEngine {
  readonly ref: Reference

  private readonly nextSubscriptionId = subId()
  private readonly subscriptions: Map<number, { ref: Reference, handler: Handler }> = new Map()

  constructor ({ ref }: PubSubOptions = {}) {
    this.ref = ref ?? getDatabase().ref('/graphql-firebase-subscriptions')
  }

  async publish (triggerName: string, payload: any): Promise<void> {
    await this.ref.child(triggerName).push(payload)
  }

  async subscribe (triggerName: string, onMessage: Function, options: Object): Promise<number> {
    const handler = (snapshot: DataSnapshot) => onMessage(snapshot.val())
    const subId = this.nextSubscriptionId.next().value
    const ref = this.ref.child(triggerName)
    ref.on('child_added', handler)

    this.subscriptions.set(subId, { ref, handler })

    return subId
  }

  async unsubscribe (subId: number) {
    const sub = this.subscriptions.get(subId)

    if (!sub) return

    sub.ref.off('child_added', sub.handler)
  }

  public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    return new PubSubAsyncIterator<T>(this, triggers)
  }
}

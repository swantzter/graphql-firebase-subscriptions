import { PubSubEngine } from 'graphql-subscriptions'
import { $$asyncIterator } from 'iterall'

export class PubSubAsyncIterator<T> implements AsyncIterator<T> {
  private readonly createdAt = Date.now()
  private readonly pubSub: PubSubEngine
  private readonly onlyNew: boolean = false
  private readonly topics: string[]

  private pullQueue: Array<(value: IteratorResult<T>) => void> = []
  private pushQueue: T[] = []
  private running = true
  private subscriptions: Promise<number[]> | undefined

  constructor (pubSub: PubSubEngine, topics: string | string[], onlyNew?: boolean) {
    this.pubSub = pubSub
    this.topics = typeof topics === 'string' ? [topics] : topics
    this.subscriptions = this.subscribeAll()
    this.onlyNew = onlyNew === true
  }

  public async next (): Promise<IteratorResult<T>> {
    if (!this.subscriptions) { await (this.subscriptions = this.subscribeAll()) }
    return await this.pullValue()
  }

  public async return (): Promise<IteratorResult<T>> {
    await this.emptyQueue()
    return { value: undefined, done: true }
  }

  public async throw (error: any) {
    await this.emptyQueue()
    return await Promise.reject(error)
  }

  public [$$asyncIterator] () {
    return this
  }

  private async pushValue (event: T, eventTimestamp: number) {
    if (this.onlyNew && eventTimestamp < this.createdAt) {
      return
    }
    await this.subscriptions
    if (this.pullQueue.length !== 0) {
      this.pullQueue.shift()!(this.running
        ? { value: event, done: false }
        : { value: undefined, done: true }
      )
    } else {
      this.pushQueue.push(event)
    }
  }

  private async pullValue (): Promise<IteratorResult<T>> {
    return await new Promise(
      resolve => {
        if (this.pushQueue.length !== 0) {
          resolve(this.running
            ? { value: this.pushQueue.shift()!, done: false }
            : { value: undefined, done: true }
          )
        } else {
          this.pullQueue.push(resolve)
        }
      }
    )
  }

  private async emptyQueue () {
    if (this.running) {
      this.running = false
      this.pullQueue.forEach(resolve => resolve({ value: undefined, done: true }))
      this.pullQueue.length = 0
      this.pushQueue.length = 0
      const subscriptionIds = await this.subscriptions
      if (subscriptionIds) { this.unsubscribeAll(subscriptionIds) }
    }
  }

  private async subscribeAll () {
    return await Promise.all(this.topics.map(
      async t => await this.pubSub.subscribe(t, this.pushValue.bind(this), {})
    ))
  }

  private unsubscribeAll (subscriptionIds: number[]) {
    for (const subscriptionId of subscriptionIds) {
      this.pubSub.unsubscribe(subscriptionId)
    }
  }
}

import { type PubSubEngine } from 'graphql-subscriptions'

export class PubSubAsyncIterableIterator<T> implements AsyncIterableIterator<T> {
  private readonly createdAt = Date.now()
  private readonly pubsub: PubSubEngine
  private readonly onlyNew: boolean = false
  private readonly eventsArray: readonly string[]

  private pullQueue: Array<(value: IteratorResult<T>) => void> = []
  private pushQueue: T[] = []
  private running = true
  private allSubscribed: Promise<number[]> | undefined

  constructor (pubSub: PubSubEngine, topics: string | readonly string[], onlyNew?: boolean) {
    this.pubsub = pubSub
    this.eventsArray = typeof topics === 'string' ? [topics] : topics
    this.onlyNew = onlyNew === true
    this.allSubscribed = this.subscribeAll()
  }

  public async next (): Promise<IteratorResult<T>> {
    if (!this.allSubscribed) { await (this.allSubscribed = this.subscribeAll()) }
    return await this.pullValue()
  }

  public async return (): Promise<IteratorResult<T>> {
    await this.emptyQueue()
    return { value: undefined, done: true }
  }

  public async throw (error: Error): Promise<never> {
    await this.emptyQueue()
    return await Promise.reject(error)
  }

  public [Symbol.asyncIterator] () {
    return this
  }

  private async pushValue (event: T, eventTimestamp: number) {
    if (this.onlyNew && eventTimestamp < this.createdAt) {
      return
    }
    await this.allSubscribed
    if (this.pullQueue.length !== 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
      this.pullQueue.forEach(resolve => { resolve({ value: undefined, done: true }) })
      this.pullQueue.length = 0
      this.pushQueue.length = 0
      const subscriptionIds = await this.allSubscribed
      if (subscriptionIds) { this.unsubscribeAll(subscriptionIds) }
    }
  }

  private async subscribeAll () {
    return await Promise.all(this.eventsArray.map(
      async t => await this.pubsub.subscribe(t, this.pushValue.bind(this), {})
    ))
  }

  private unsubscribeAll (subscriptionIds: number[]) {
    for (const subscriptionId of subscriptionIds) {
      this.pubsub.unsubscribe(subscriptionId)
    }
  }
}

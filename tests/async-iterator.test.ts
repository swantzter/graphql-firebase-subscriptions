/* eslint-env mocha */
import { randomUUID } from 'crypto'
import { type PubSubEngine } from 'graphql-subscriptions'
import { PubSubAsyncIterableIterator } from '../src/async-iterator'
import Sinon from 'sinon'
import assert from 'assert'

const sinon = Sinon.createSandbox()

describe('PubSubAsyncIterator', () => {
  let currentSubscriptionId: number
  let ps: PubSubEngine
  let broadcast: (...args: any[]) => any
  let ai: PubSubAsyncIterableIterator<any>
  let topic: string

  beforeEach(() => {
    currentSubscriptionId = 0
    ps = ({
      subscribe: sinon.stub().callsFake(async (_, onMessage) => {
        broadcast = onMessage
        currentSubscriptionId += 1
        return currentSubscriptionId
      }),
      unsubscribe: sinon.spy(),
    } as any) as PubSubEngine
    topic = randomUUID()
    ai = new PubSubAsyncIterableIterator(ps, topic)
  })

  afterEach(() => {
    sinon.restore()
  })

  it('it converts a single topic to an array of topics', () => {
    const topic = randomUUID()
    const topicAI = new PubSubAsyncIterableIterator(ps, topic)

    assert.deepStrictEqual((topicAI as any).eventsArray, [topic])
  })

  it('accepts multiple topics', () => {
    const topicA = randomUUID()
    const topicB = randomUUID()
    const topicAI = new PubSubAsyncIterableIterator(ps, [topicA, topicB])

    assert.deepStrictEqual((topicAI as any).eventsArray, [topicA, topicB])
  })

  it('empties the queue', () => {
    sinon.stub(ai as any, 'unsubscribeAll')

    assert.strictEqual((ai as any).running, true)

    ; (ai as any).emptyQueue()

    assert.strictEqual((ai as any).running, false)
    assert.strictEqual((ai as any).pullQueue.length, 0)
    assert.strictEqual((ai as any).pushQueue.length, 0)
  })

  it('broadcast events', async () => {
    const eventA = randomUUID()
    const eventB = randomUUID()

    broadcast(eventA)
    broadcast(eventB)

    assert.deepStrictEqual(await ai.next(), { value: eventA, done: false })
    assert.deepStrictEqual(await ai.next(), { value: eventB, done: false })

    assert.strictEqual((ai as any).pullQueue.length, 0)
    assert.strictEqual((ai as any).pushQueue.length, 0)
  })

  it('is able to throw an error', async () => {
    const message = randomUUID()

    await assert.rejects(ai.throw(new Error(message)), {
      name: 'Error',
      message,
    })
  })

  it('is an async iterator', () => {
    assert.deepStrictEqual((ai as any)[Symbol.asyncIterator](), ai)
  })

  it('resolves immediately', async () => {
    const event = randomUUID()

    setTimeout(() => {
      broadcast(event)
    }, 50)

    assert.deepStrictEqual(await ai.next(), { value: event, done: false })
  })

  it('emptyQueue: resolves all next calls immediately', async () => {
    setTimeout(() => {
      (ai as any).emptyQueue([currentSubscriptionId])
    }, 100)

    assert.deepStrictEqual(await ai.next(), { value: undefined, done: true })
  })
})

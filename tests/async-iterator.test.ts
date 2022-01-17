/* eslint-env mocha */
import { randomUUID } from 'crypto'
import { PubSubEngine } from 'graphql-subscriptions'
import { PubSubAsyncIterator } from '../src/async-iterator'
import { $$asyncIterator } from 'iterall'
import Sinon from 'sinon'
import assert from 'assert'

const sinon = Sinon.createSandbox()

describe('PubSubAsyncIterator', () => {
  let currentSubscriptionId: number
  let ps: PubSubEngine
  let broadcast: Function
  let ai: PubSubAsyncIterator<any>
  let topic: string

  beforeEach(() => {
    currentSubscriptionId = 0
    ps = ({
      subscribe: sinon.stub().callsFake(async (_, onMessage) => {
        broadcast = onMessage
        currentSubscriptionId += 1
        return currentSubscriptionId
      }),
      unsubscribe: sinon.spy()
    } as any) as PubSubEngine
    topic = randomUUID()
    ai = new PubSubAsyncIterator(ps, topic)
  })

  afterEach(() => {
    sinon.restore()
  })

  it('it converts a single topic to an array of topics', () => {
    const topic = randomUUID()
    const topicAI = new PubSubAsyncIterator(ps, topic)

    assert.deepStrictEqual((topicAI as any).topics, [topic])
  })

  it('accepts multiple topics', () => {
    const topicA = randomUUID()
    const topicB = randomUUID()
    const topicAI = new PubSubAsyncIterator(ps, [topicA, topicB])

    assert.deepStrictEqual((topicAI as any).topics, [topicA, topicB])
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
      message
    })
  })

  it('is an async iterator', () => {
    assert.deepStrictEqual((ai as any)[$$asyncIterator](), ai)
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

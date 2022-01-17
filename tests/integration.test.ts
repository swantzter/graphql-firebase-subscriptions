/* eslint-env mocha */
import { getDatabase, Reference } from 'firebase-admin/database'
import { randomUUID } from 'crypto'
import assert from 'assert'
import Sinon from 'sinon'
import { PubSub } from '../src'

const sinon = Sinon.createSandbox()

describe('PubSub - integration', () => {
  afterEach(async () => {
    await getDatabase().ref('/').set({})
    sinon.restore()
  })

  it('Should emit an event via asyncIterator', async () => {
    const topic = randomUUID()
    const ps = new PubSub()
    const ai = ps.asyncIterator(topic)

    await ps.publish(topic, { a: 1 })

    assert.deepStrictEqual(await ai.next(), { value: { a: 1 }, done: false })
  })

  it('Should use an alternative base ref', async () => {
    const topic = randomUUID()
    const ps = new PubSub({ ref: getDatabase().ref('/test') })

    await ps.publish(topic, 'a')

    const defaultSnap = await getDatabase().ref('/graphql-firebase-subscriptions').get()
    assert.deepStrictEqual(defaultSnap.val(), null)

    const alternativeSnap = await getDatabase().ref('/test').get()
    assert.deepStrictEqual(Object.values(alternativeSnap.val()?.[topic]), ['a'])
  })

  it('Should return event at least once via local cache', async () => {
    const ref = {
      child: sinon.stub().returns({
        child: sinon.stub().returns({
          set: sinon.stub().resolves(true)
        }),
        on: sinon.stub()
      })
    } as any as Reference

    const topic = randomUUID()
    const ps = new PubSub({ localCache: true, ref })
    const ai = ps.asyncIterator(topic)

    await ps.publish(topic, 'a')

    assert.deepStrictEqual(await ai.next(), { value: 'a', done: false })
  })
})
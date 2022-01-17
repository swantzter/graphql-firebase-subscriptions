/* eslint-env mocha */
import { initializeApp } from 'firebase-admin/app'
import assert from 'assert'
import { getDatabase } from 'firebase-admin/database'
import { PubSub } from '../src'
import { randomUUID } from 'crypto'

initializeApp({
  databaseURL: `http://${process.env.GCLOUD_PROJECT}.firebaseio.com`
})

describe('PubSub - integration', () => {
  afterEach(async () => {
    await getDatabase().ref('/').set({})
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
})

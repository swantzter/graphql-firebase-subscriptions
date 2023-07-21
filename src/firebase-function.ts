import { getDatabase, type Reference, type Query } from 'firebase-admin/database'
import { logger, pubsub } from 'firebase-functions'
import { DEFAULT_PATH } from './helpers'

export interface FunctionFactoryOptions {
  /** Supports an array or an enum */
  topics: string[] | Record<string, string | number>
  /** Base ref used to publish events */
  ref?: Reference
  /**
   * @default 'every 10 minutes'
   * Define the schedule using either unix crontab syntax or AppEngine
   * cron.yaml syntax. See <https://firebase.google.com/docs/functions/schedule-functions#write_a_scheduled_function>
  */
  schedule?: string
  /**
   * @default 600000
   * will delete messages older than this amount of milliseconds
   */
  maxAge?: number
}

export default function getDeletionRoutineFunction ({ ref, schedule, maxAge, topics }: FunctionFactoryOptions) {
  return pubsub.schedule(schedule ?? 'every 10 minutes').onRun(async () => {
    const baseRef = ref ?? getDatabase().ref(DEFAULT_PATH)

    const t = Array.isArray(topics) ? topics : Object.values(topics)

    for (const topic of t) {
      const query = baseRef.child(topic.toString())
        .orderByChild('timestamp')
        .endAt(Date.now() - (maxAge ?? 10 * 60 * 1000))
        .limitToFirst(1000)

      await new Promise<void>((resolve, reject) => {
        deleteRTDBBatch(query, resolve).catch(reject)
      })
    }
  })
}

async function deleteRTDBBatch (query: Query, resolve: () => void) {
  const snapshot = await query.get()

  const batchSize = snapshot.numChildren()
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve()
    return
  }

  logger.info(`RTDB: deleting ${batchSize} nodes from ${snapshot.ref.key}`)
  const data = snapshot.val()
  await snapshot.ref.update(Object.fromEntries(Object.keys(data).map(k => [k, null])))
  logger.info('RTDB: deleted batch')

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    void deleteRTDBBatch(query, resolve)
  })
}

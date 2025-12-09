import { getDatabase, type Reference, type Query } from 'firebase-admin/database'
import { logger, scheduler } from 'firebase-functions'
import { DEFAULT_PATH } from './helpers'
import type { ScheduleOptions } from 'firebase-functions/scheduler'

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
  /**
   * Allows overriding things like region, timeouts, etc.
   */
  functionOptions?: Omit<ScheduleOptions, 'schedule'>
}

export default function getDeletionRoutineFunction ({ ref, schedule, maxAge, topics, functionOptions }: FunctionFactoryOptions) {
  return scheduler.onSchedule({
    ...(functionOptions ?? {}),
    schedule: schedule ?? 'every 10 minutes',
  }, async () => {
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await snapshot.ref.update(Object.fromEntries(Object.keys(data).map(k => [k, null])))
  logger.info('RTDB: deleted batch')

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    void deleteRTDBBatch(query, resolve)
  })
}

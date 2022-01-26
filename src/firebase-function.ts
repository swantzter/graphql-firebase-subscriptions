import { getDatabase, Reference } from 'firebase-admin/database'
import { pubsub } from 'firebase-functions'
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
      await baseRef.child(topic.toString())
        .orderByChild('timestamp')
        .endAt(Date.now() - (maxAge ?? 10 * 60 * 1000))
        .once('value', async snap => {
          const promises: Array<Promise<void>> = []
          snap.forEach(cSnap => {
            promises.push(cSnap.ref.remove())
          })
          await Promise.allSettled(promises)
        })
    }
  })
}

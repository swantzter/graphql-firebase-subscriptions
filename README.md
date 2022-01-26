# GraphQL Subscriptions through Firebase Realtime Database

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![QA](https://github.com/swantzter/graphql-firebase-subscriptions/actions/workflows/qa.yml/badge.svg)](https://github.com/swantzter/graphql-firebase-subscriptions/actions/workflows/qa.yml)
[![Publish to NPM and GCR](https://github.com/swantzter/graphql-firebase-subscriptions/actions/workflows/publish.yml/badge.svg)](https://github.com/swantzter/graphql-firebase-subscriptions/actions/workflows/publish.yml)
[![codecov](https://codecov.io/gh/swantzter/graphql-firebase-subscriptions/branch/main/graph/badge.svg)](https://codecov.io/gh/swantzter/graphql-firebase-subscriptions)

This is a GraphQL Subscriptions implementation that uses Firebase Realtime
Database as a message broker.

## Comparison

Depending on your use-case this may or may not be the tool for you, this
implementation is *not* meant as a way to listen to state updates on persisted
data, for that you should probably look at
[graphql-firestore-subscriptions][graphql-firestore-subscriptions].
This implementation is closer to an alternative to [Google PubSub][pubsub].
Now you may wonder, "why not use PuSub then?" well, basically I had concerns
that the PubSub documentation stated the performance on low message volumes
might not be great on PubSub since the priority was low latency at high load,
some graphs I saw showed seconds of latency for the types of volumes I was
looking at, whereas I've experienced a more consistent performance from RTDB,
but it doesn't go lower with scale like PubSub does. For using PubSub, there's
[graphql-google-pubsub][graphql-google-pubsub].

Now Firebase RTDB isn't without latency, not at all! And to alleviate this,
this library also provides an optional "local cache", this is really useful
if you're running on something like Google Cloud Run where you have multiple
instances serving requests. Turning this on will make the library work on an
"at-least-once" delivery principle. If something happens (most likely a
mutation) on the same instance a subscriber is connected to it will use an
internal in-memory EventEmitter and "instantly" forward the message. It will
also publish the message to Firestore RTDB and keep the node ID in a
short-lived local cache, when the message later arrives, and assuming its ID
hasn't expired from the cache, it will simply be ignored and not re-emitted
to subscribers connected to the instance that originally received the message.

[graphql-firestore-subscriptions]: https://github.com/m19c/graphql-firestore-subscriptions
[graphql-google-pubsub]: https://github.com/axelspringer/graphql-google-pubsub
[pubsub]: https://cloud.google.com/pubsub

## Usage

By default, the ref `/graphql-firebase-subscriptions` in your database will be
used as the root for messages.

```typescript
import { PubSub } from 'graphql-firebase-subscriptions'

enum Topic {
  NEW_COMMENT = 'new-comment'
}

const pubSub = new PubSub()

const Resolvers = {
  Subscription: {
    newComment: {
      subscribe: () => pubSub.asyncIterator(Topic.NEW_COMMENT)
    }
  },
  Mutation: {
    async addComment (_, args, ctx) {
      const comment = await ctx.dataSources.comments.createOne(args.postId, args.comment)
      await pubSub.publish(Topic.NEW_COMMENT, { postId: args.postId, commentId: comment.id })

      return comment
    }
  }
}
```

### Local Cache

Enabling the local cache for speed up is as simple as a boolean

```typescript
import { PubSub } from 'graphql-firebase-subscriptions'

const pubSub = new PubSub({ localCache: true })
```

### Alternative base ref

You can use an alternative base ref for the message brokerage, useful if you
want separate instances with the same topics.

```typescript
import { PubSub } from 'graphql-firebase-subscriptions'
import { getDatabase } from 'firebase-admin/database'

const pubSub = new PubSub({
  ref: getDatabase().ref('/path/to/base/ref')
})
```

## Cleanup

This library requires you to clean up old messages, else it will just keep
adding messages to the topics forever. This could slow down message delivery,
and it'll waste storage and cost.

To help with this task, the library provides a Firebase Function that
works on a Google Cloud Scheduler Trigger. Note that per Firebase's own
[documentation][cloud-fn-schedule] a cloud scheduler job costs about
USD 0.10 per month and requires you to be on the Blaze plan for firebase.

[cloud-fn-schedule]: https://firebase.google.com/docs/functions/schedule-functions

To use it, just generate a handler and re-export it

```typescript
import getDeletionRoutineFunction from 'graphql-firebase-subscriptions/firebase-functions'

enum Topics {
  NEW_COMMENT = 'new-comment'
}

export const pubSubDeletionRoutine = getDeletionRoutineFunction({
  topics: Topics,

  // -------OPTIONAL-------
  // You can overwrite the base ref, if you've done so when using the PubSub
  ref: getDatabase.ref('/graphql-firebase-subscriptions'),
  // you can override the schedule for the function, by default it runs every
  // 10 minutes
  schedule: 'every 10 minutes',
  // and you can override the maximum time a message should be stored,
  // the default is to delete messages older than 10 minutes
  maxAge: 600_000
})
```

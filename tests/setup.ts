import { initializeApp } from 'firebase-admin/app'

process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? 'localhost:9000'
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-test'

initializeApp({
  // Apparently it's required that you set the URL even when using the emulators
  // contrary to the docs
  databaseURL: `http://${process.env.GCLOUD_PROJECT}.firebaseio.com`
})

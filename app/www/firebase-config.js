// Firebase Web app config — get this from Firebase Console > Project Settings > General >
// "Your apps" > add a Web app (</>) if you haven't already. These values are meant to be
// public (they identify the project, they don't grant access), so it's fine to commit this file.
//
// Also grab the "Web Push certificate" (VAPID key) from Project Settings > Cloud Messaging >
// Web configuration, and set FIREBASE_VAPID_KEY below.
self.FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_WEB_APP_ID',
};

if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = self.FIREBASE_CONFIG;
  window.FIREBASE_VAPID_KEY = 'YOUR_VAPID_KEY';
}

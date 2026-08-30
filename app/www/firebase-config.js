// Firebase Web app config — get this from Firebase Console > Project Settings > General >
// "Your apps" > add a Web app (</>) if you haven't already. These values are meant to be
// public (they identify the project, they don't grant access), so it's fine to commit this file.
//
// Also grab the "Web Push certificate" (VAPID key) from Project Settings > Cloud Messaging >
// Web configuration, and set FIREBASE_VAPID_KEY below.
self.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDpvPNXEYEo4Y5zP6oV43B8U_4GEFgDV9E',
  authDomain: 'debt-pawn-tracker-cc106.firebaseapp.com',
  projectId: 'debt-pawn-tracker-cc106',
  storageBucket: 'debt-pawn-tracker-cc106.firebasestorage.app',
  messagingSenderId: '323753613747',
  appId: '1:323753613747:web:b848d3f3a757f34ba5d3c6',
};

if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = self.FIREBASE_CONFIG;
  window.FIREBASE_VAPID_KEY = 'BAzb66_fru-Nt9MRz7RQR1BAn9UYTb5HPa0M1BYvBCAt_DuOixMa2PhH9zcTNtYd9ybpUATsYjzMKRrDP8dq90E';
}

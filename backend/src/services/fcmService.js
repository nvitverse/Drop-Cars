let admin;
try {
  admin = require('firebase-admin');
  const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch {
  console.warn('Firebase Admin SDK not initialised — FCM notifications disabled');
  admin = null;
}

async function sendPush(fcmToken, { title, body, data = {} }) {
  if (!admin || !fcmToken) return;
  try {
    await admin.messaging().send({ token: fcmToken, notification: { title, body }, data });
  } catch (err) {
    console.error('FCM error:', err.message);
  }
}

module.exports = { sendPush };

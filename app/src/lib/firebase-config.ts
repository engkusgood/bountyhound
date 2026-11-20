// BountyHound — Firebase web config.
//
// ⚠️ PLACEHOLDER — the real config comes from the Firebase console project
// (parent browser task). Replace the values below with the project's web
// app config. Until then the app runs in a clearly-labelled
// "Firebase config not set yet" state: AI calls throw a visible
// "config missing" error and never return invented data.
//
// Firebase web config values are public by design (they identify the
// project; access is enforced by App Check + Firestore rules), but no
// secret (API key for a private service, token, private key) belongs here.

export const firebaseConfig = {
  apiKey: 'AIzaSyBXikJvgIGghlDBDPavv2hEoir1waeDHy4',
  authDomain: 'bountyhound.firebaseapp.com',
  projectId: 'bountyhound',
  storageBucket: 'bountyhound.firebasestorage.app',
  messagingSenderId: '893734043708',
  appId: '1:893734043708:web:43d685337291eff8824339',
};

/** True once the real Firebase console config has been pasted in. */
export const isFirebaseConfigured =
  firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
  firebaseConfig.projectId !== 'YOUR_PROJECT_ID' &&
  firebaseConfig.appId !== 'YOUR_APP_ID';

export const CONFIG_MISSING_ERROR =
  'Firebase config missing: paste the real web app config from the Firebase console into src/lib/firebase-config.ts (see app/README.md).';

// reCAPTCHA Enterprise site key for App Check (production). Placeholder
// until the App Check setup in the Firebase console provides one.
// Local dev uses the App Check debug provider instead (see firebase.ts),
// so this value is not needed to run locally.
export const recaptchaEnterpriseSiteKey = 'YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY';

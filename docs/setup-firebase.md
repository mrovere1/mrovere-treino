# Firebase Setup

This project uses Firebase Authentication with email and password plus Firestore user profiles.

## 1. Create the Firebase project

1. Open Firebase Console.
2. Create a new project.
3. Skip Google Analytics if it is not needed for this internal portal.

## 2. Enable Email/Password Authentication

1. Open Authentication.
2. Open Sign-in method.
3. Enable `Email/Password`.

## 3. Create Firestore

1. Open Firestore Database.
2. Create the database.
3. Start in production mode if you plan to apply the rules immediately.

## 4. Copy the Firebase config

Open Project settings and copy the web app configuration into `src/firebase.js`:

```js
const firebaseConfig = {
  apiKey: "PASTE_HERE",
  authDomain: "PASTE_HERE",
  projectId: "PASTE_HERE",
  storageBucket: "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId: "PASTE_HERE"
};
```

## 5. Create the first admin in Authentication

1. Open Authentication > Users.
2. Add user.
3. Enter the email and password.
4. Save the user.
5. Open the new user and copy the UID.

## 6. Create the matching Firestore profile

Create the document:

```text
users/{uid}
```

Suggested document:

```json
{
  "email": "admin@example.com",
  "name": "Admin User",
  "role": "admin",
  "active": true,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

## 7. Create readonly users manually

Repeat the same manual process:

1. Create the user in Authentication.
2. Copy the UID.
3. Create `users/{uid}` in Firestore.
4. Set:

```json
{
  "email": "readonly@example.com",
  "name": "Readonly User",
  "role": "readonly",
  "active": true
}
```

## 8. Suggested Firestore rules

Use this as a starting point and adapt it if your collection layout changes:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function ownProfile() {
      return signedIn() &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function userProfile() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isActive() {
      return ownProfile() && userProfile().active == true;
    }

    function isAdmin() {
      return isActive() && userProfile().role == "admin";
    }

    match /users/{userId} {
      allow get: if signedIn() && request.auth.uid == userId;
      allow list: if isAdmin();
      allow create, update, delete: if isAdmin();
    }

    match /appData/{document=**} {
      allow read: if isActive();
      allow write: if isAdmin();
    }

    match /partnerTemplates/{document=**} {
      allow read: if isActive();
      allow write: if isAdmin();
    }

    match /irisSnapshots/{document=**} {
      allow read: if isActive();
      allow write: if isAdmin();
    }
  }
}
```

## 9. Test login

1. Start the local server.
2. Open the portal.
3. Sign in with the admin email and password.
4. Confirm that:
   - Home loads
   - Admin is visible
   - Partner Dashboard is visible
   - IRIS Dashboard is visible
   - MROVERE Tasks is visible

## 10. Test readonly access

1. Sign out.
2. Sign in with the readonly user.
3. Confirm that:
   - Home loads
   - Partner Dashboard is visible
   - IRIS Dashboard is visible
   - Admin is hidden
   - MROVERE Tasks is hidden

## 11. Test missing profile blocking

1. Create a Firebase Authentication user.
2. Do not create `users/{uid}` in Firestore.
3. Sign in.
4. Confirm the portal shows:

```text
Authenticated user, but no profile was configured. Please request access from the administrator.
```

## 12. Test inactive user blocking

1. Set `active` to `false` in `users/{uid}`.
2. Sign in.
3. Confirm the portal signs the user out and blocks access.

# Student Skill Development App - Role Based Auth

## Tech Stack
- Frontend: React + Vite
- Auth + Database: Firebase Authentication + Firestore
- Backend APIs (existing project): Node.js + Express

## User Roles
- `student` (default during registration)
- `admin` (set manually in database)

## Firestore Schema (`users` collection)
Each document id is the Firebase Auth UID.

```json
{
  "id": "<uid>",
  "name": "Vishal S",
  "email": "vishal@email.com",
  "password": "<managed by Firebase Auth>",
  "role": "student"
}
```

Note:
- In secure systems, passwords are not stored in Firestore. Firebase Auth stores password securely.
- For college schema requirement, `password` is represented as Auth-managed.

## Login Logic (Role Redirect)
1. Admin login reads `users` collection by trimmed email.
2. Password is compared exactly (case-sensitive) after trim.
3. If credentials mismatch -> show `Invalid email or password`.
4. If role is `admin` -> redirect `/admin/dashboard`.
5. If role is `student` -> redirect `/dashboard`.

### Corrected Admin Login Authentication Code

```javascript
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebase";

async function authenticateByUsersTable(inputEmail, inputPassword) {
  const email = inputEmail.trim().toLowerCase();
  const password = inputPassword.trim();

  const userSnap = await getDocs(
    query(collection(db, "users"), where("email", "==", email), limit(1))
  );

  if (userSnap.empty) {
    return { ok: false, message: "Invalid email or password" };
  }

  const user = userSnap.docs[0].data();
  const storedPassword = String(user.password || "");

  // Case-sensitive password validation
  if (storedPassword !== password) {
    return { ok: false, message: "Invalid email or password" };
  }

  const role = user.role || "student";
  return {
    ok: true,
    role,
    redirectTo: role === "admin" ? "/admin/dashboard" : "/dashboard",
  };
}
```

## Admin Role Setup (Manual)
Update `users/{id}.role = "admin"` in Firestore console for faculty/admin accounts.

## Test Admin Credentials
- Email: `admin@skilldev.com`
- Password: `admin123`

## Access Control
- Admin pages wrapped with `AdminProtectedRoute`.
- Admin route checks role in `users` doc before rendering.
- Student pages remain under regular `ProtectedRoute`.

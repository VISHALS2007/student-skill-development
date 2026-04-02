# Administrator Module

## Tech Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database/Auth: Firebase Firestore + Firebase Auth

## User Roles
- `student` = default role during registration
- `admin` = set manually in the `users` collection

## Database Schema

### `users`
| Field | Type | Notes |
|---|---|---|
| id | string | Firebase UID / user document id |
| name | string | Full name |
| email | string | Unique email |
| password | string | Stored for project/demo flow; Firebase Auth should be used in production |
| role | string | `student` or `admin` |

### `courses`
| Field | Type | Notes |
|---|---|---|
| id | string | Course document id |
| course_name | string | Course title |
| description | string | Course summary |

### `user_courses`
| Field | Type | Notes |
|---|---|---|
| id | string | `${user_id}_${course_id}` |
| user_id | string | Student id |
| course_id | string | Course id |
| status | string | assigned / in_progress / completed |

### `attendance`
| Field | Type | Notes |
|---|---|---|
| id | string | Attendance document id |
| user_id | string | Student id |
| course_id | string | Course id |
| date | string | `YYYY-MM-DD` |
| status | string | present / absent / partial |

## Login Flow
1. Admin enters email + password.
2. Backend looks up the matching `users` document by trimmed email.
3. Password is compared exactly, case-sensitively.
4. If `role === "admin"`, redirect to `/admin/dashboard`.
5. If `role === "student"`, redirect to `/dashboard`.

## Test Admin Credentials
- Email: `admin@skilldev.com`
- Password: `admin123`

## Admin API Endpoints
- `POST /api/admin/login`
- `GET /api/admin/courses`
- `POST /api/admin/courses`
- `PUT /api/admin/courses/:courseId`
- `DELETE /api/admin/courses/:courseId`
- `POST /api/admin/courses/assign/all`
- `POST /api/admin/courses/assign/selected`
- `DELETE /api/admin/courses/assign/:userId/:courseId`
- `GET /api/admin/users`
- `GET /api/admin/users/:userId`
- `DELETE /api/admin/users/:userId`
- `PATCH /api/admin/users/:userId/status`
- `PATCH /api/admin/users/:userId/password`
- `GET /api/admin/progress/:userId`
- `POST /api/admin/attendance`
- `GET /api/admin/attendance`
- `GET /api/admin/reports`
- `POST /api/admin/notifications`

## Role-Based Access Control
- Admin routes are protected by `verifyAuth` + `verifyAdmin`.
- Student routes remain under regular protected routes.
- Students can only view assigned courses in the student module.

## Debug Check
The admin login page calls `GET /api/admin/health` and shows a database connection status message.

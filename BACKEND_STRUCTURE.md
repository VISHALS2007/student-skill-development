# Backend Structure for Student Skill Development App

## Database Tables

### users
| Field | Type |
|---|---|
| id | string |
| name | string |
| email | string |
| password | string |
| role | string |

### courses
| Field | Type |
|---|---|
| id | string |
| course_name | string |
| description | string |

### assignments
| Field | Type |
|---|---|
| id | string |
| title | string |
| description | string |
| open_date | string/date |
| due_date | string/date |

### assignment_users
| Field | Type |
|---|---|
| id | string |
| assignment_id | string |
| user_id | string |
| status | string |
| progress | number |

### attendance
| Field | Type |
|---|---|
| id | string |
| user_id | string |
| course_id | string |
| date | string |
| status | string |

## API Flow

### Admin Login
`POST /api/admin/login`
- verify email + password
- check role = admin
- return dashboard redirect info

### Create Assignment
`POST /api/admin/assignments/create`
- save title, description, dates

### Assign to Users
`POST /api/admin/assignments/assign`
- assign to all users or selected users
- insert into assignment_users

### Get All Users
`GET /api/admin/users`
- return all students list

### Track Progress
`GET /api/admin/assignments/progress/:id`
- show completed & pending users

### Attendance
`POST /api/admin/attendance/mark`
`GET /api/admin/attendance/report`

## Folder Structure

```text
backend/
├── config/
│   └── database.js
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── courses.js
│   ├── assignments.js
│   └── attendance.js
├── controllers/
└── server.js
```

## Workflow

Admin Login -> Create Assignment -> Assign to Users -> Student Submit -> Update Status -> Admin Track Progress

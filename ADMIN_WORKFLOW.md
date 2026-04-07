# Administrator Options and Workflow

This document defines the administrator capabilities and operational flow for the Student Skill Development App.

## Administrator Options

### Dashboard
- View system summary:
  - Total students
  - Total courses
  - Completed tasks
  - Attendance overview

### User Management
- View registered users
- Search users by email or name
- Select single or multiple users
- Enable or disable users

### Course Management
- Create new course
- Edit course details
- Delete course
- View all courses

### Course Allocation
- Assign a course to all users
- Assign a course to selected users
- Remove assigned course

### Assignment Management
- Create assignments
- Set open date and due date
- Track submission status

### Progress Tracking
- View completed students
- View incomplete students
- Check daily progress

### Attendance Management
- Mark attendance daily
- View attendance report
- Filter attendance by course

## Administrator Workflow

Admin Login -> Dashboard
-> Create Course
-> Search Registered Users (by email)
-> Select Users
-> Assign Course or Assignment
-> Students complete tasks
-> Admin checks Completed or Incomplete
-> Admin marks Attendance
-> View Reports and Progress

## Example Workflow (Real Case)

1. Admin creates English Speaking Course.
2. Admin searches user `vishal@bitsathy.ac.in`.
3. Admin selects required users.
4. Admin assigns course.
5. Students complete tasks.
6. Admin checks daily progress.
7. Admin marks attendance.
8. Admin generates report.

## Implementation Mapping

- Admin login: `POST /api/admin/login`
- Dashboard data: `GET /api/admin/dashboard`
- User management: `GET /api/admin/users`, `PATCH /api/admin/users/:userId/status`, `DELETE /api/admin/users/:userId`
- Course management: `GET|POST|PUT|DELETE /api/admin/courses`
- Course allocation:
  - `POST /api/admin/courses/assign/all`
  - `POST /api/admin/courses/assign/selected`
  - `POST /api/admin/allocate`
  - `GET /api/admin/allocations`
  - `DELETE /api/admin/courses/assign/:userId/:courseId`
- Assignment management: `GET|POST|PUT|DELETE /api/admin/assignments`
- Progress tracking:
  - `GET /api/admin/progress`
  - `GET /api/admin/progress/:userId`
  - `GET /api/admin/assignments/progress/:assignmentId`
- Attendance management:
  - `POST /api/admin/attendance`
  - `POST /api/admin/attendance/mark`
  - `POST /api/admin/attendance/bulk`
  - `GET /api/admin/attendance`
- Reports and analytics:
  - `GET /api/admin/reports`
  - `GET /api/admin/reports/attendance`

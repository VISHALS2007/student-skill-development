# Student Options and Workflow

This document defines student-side capabilities and the end-to-end learning flow in the Student Skill Development App.

## Student Options

### Registration and Login
- Create account using name, email, and password
- Login to access personal dashboard

### Student Dashboard
- View assigned courses
- See upcoming assignments
- Check attendance summary
- View progress percentage

### My Courses
- View courses assigned by admin
- Open course materials (notes, videos)
- Track course completion

### Assignments
- View assignment title and details
- Check open date and due date
- Submit task
- See submission status (`Completed` or `Pending`)

### Progress Tracking
- View completed courses
- See incomplete tasks
- Monitor daily progress

### Attendance
- View attendance status
- Check present/absent records

## Student Workflow

Register -> Login -> Dashboard
-> View Assigned Courses
-> Open Course Materials
-> Complete Assignments
-> Submit Task
-> Check Progress
-> View Attendance

## Implementation Mapping

- Registration/Login: Firebase Auth (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, Google sign-in)
- Dashboard: Student modules for assigned courses, assignments, progress, and attendance
- Assigned courses: `GET /api/student/courses`
- Assignments: `GET /api/student/assignments`, `PUT /api/student/assignments/:assignmentId/complete`
- Progress: `GET /api/student/progress`
- Attendance: `GET /api/student/attendance`, `GET /api/student/attendance/allocated`, `GET /api/student/attendance/myskills`
- Profile and skills: `GET /api/student/profile`, `GET|POST|PUT|DELETE /api/student/skills`

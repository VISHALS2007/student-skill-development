# Master Professional Prompt

Develop a professional Student Skill Development Management System with a clean UI and role-based access for Main Admin, Sub Admin, and Students.

## General Requirements
- Single login page for all users with role-based redirect
- Student registration allowed only for @bitsathy.ac.in email IDs
- Auto-detect department and batch from email (example: ec23 -> ECE, 2023 batch)
- Role-based dashboards (Main Admin, Sub Admin, Student)
- Responsive UI with sidebar navigation and dashboard cards

## Login Page
- Fields: Email, Password
- Student registration validation: @bitsathy.ac.in
- Redirect by role:
  - main_admin -> Main Admin Dashboard
  - sub_admin -> Sub Admin Dashboard
  - student -> Student Dashboard

## Student Registration
- Name
- Email (@bitsathy.ac.in only)
- Password
- Department (auto extracted)
- Batch (auto extracted)
- Register button
- Validation messages

## Main Admin Dashboard
- Total Students
- Active Courses
- Present Today
- Absent Today
- Average Performance
- Quick cards:
  - All Users
  - Attendance Reports
  - Performance Reports
  - Sub Admin Management

## Main Admin Pages
1. Dashboard
2. All Users
3. Attendance Monitoring
4. Performance Reports
5. Sub Admin Management

## Sub Admin Dashboard
- Assigned Students Count
- Active Courses
- Assessments Created
- Allocation Status

## Sub Admin Pages
1. Dashboard
2. Manage Courses
3. Manage Assessments
4. Student Allocation
5. Assigned Students

## Course Creation
- Course Title
- Category (Coding / Aptitude / Communication / Others)
- Duration (days)
- Start Date
- End Date
- Description
- Reference Links
- Create Button

## Assessment
- Assessment Title
- Course Selection
- Type (Quiz / Coding / Aptitude)
- Duration (minutes)
- Total Marks
- Question Builder
- Save Assessment

## Student Allocation
- Filter by Department
- Filter by Batch
- Search by Email
- Multi-select students
- Select Course
- Assign Button

## Student Dashboard
- My Courses
- Today's Attendance
- Upcoming Assessments
- Completed Courses
- Performance Overview

## Student Pages
1. Dashboard
2. My Courses
3. My Assessments
4. Attendance
5. My Skills (optional add/remove)
6. Profile

## Attendance Logic
- Daily attendance auto-calculated
- Completed = Present
- Not completed = Absent
- Reset at 12 AM daily
- Duration-based tracking

## Assessment Logic
- Timer-based quiz
- Auto-submit
- Auto-evaluation for MCQ
- Coding evaluation (test case based)
- Score stored
- Reports generated

## Reports
- Student-wise performance
- Course-wise completion
- Attendance percentage
- Export CSV

## Permissions
### Main Admin
- View all users
- View attendance
- View reports
- Manage sub admins

### Sub Admin
- Create courses
- Create assessments
- Allocate students

### Student
- View assigned courses
- Attend
- Take assessments
- View performance

## UI Structure
- Sidebar navigation
- Top navbar
- Dashboard cards
- Table with search and filters
- Pagination
- Responsive design
- Loading states

## Database Tables
- Users
- Courses
- Assessments
- Allocations
- Attendance
- Results

## Optimization
- Fast loading
- Lazy loading tables
- API caching
- Indexed search

Build this as a professional training management platform suitable for college skill development programs.

## Final Page Structure

Login
Register (Student only)

Main Admin
- Dashboard
- Users
- Attendance
- Reports
- Sub Admins

Sub Admin
- Dashboard
- Courses
- Assessments
- Allocation
- Students

Student
- Dashboard
- My Courses
- Assessments
- Attendance
- Skills
- Profile

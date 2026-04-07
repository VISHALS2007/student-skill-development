# Admin Operations Manual - Step-by-Step Procedures 📋

## Table of Contents
1. [Admin Login](# admin-login)
2. [Dashboard Operations](# dashboard-operations)
3. [User Management](# user-management)
4. [Course Management](# course-management)
5. [Course Allocation](# course-allocation)
6. [Assignment Management](# assignment-management)
7. [Attendance Management](# attendance-management)
8. [Progress Tracking](# progress-tracking)
9. [Reports & Analytics](# reports--analytics)

---

## ADMIN LOGIN

### Credentials
```
Email:    admin@skilldev.com
Password: admin123
```

### Login Steps
1. Visit admin login page
2. Enter email: `admin@skilldev.com`
3. Enter password: `admin123`
4. Click "Login"
5. System verifies credentials with Firebase
6. Redirected to Admin Dashboard

### Verification
- ✅ Dashboard appears with 8 sidebar items
- ✅ Can see "Refresh" and "Logout" buttons
- ✅ All metrics display correctly

---

## DASHBOARD OPERATIONS

### Dashboard Overview
The first page admin sees after login.

**Displays:**
- Total Students
- Active Learners
- Active Courses
- Total Assignments
- Completed Tasks
- Attendance Percentage

### Dashboard Tasks

#### Task 1: Review System Metrics
1. Log in to admin account
2. Check Dashboard automatically loads
3. Review 5 metric cards:
   - Total Students: 248
   - Active Learners: 173
   - Courses: 26
   - Assignments: 45
   - Attendance: 87%

#### Task 2: Navigate to Other Pages
1. Click on any sidebar item:
   - Users
   - Courses
   - Allocation
   - Assignments
   - Attendance
   - Progress
   - Reports
2. Page loads with specific controls

#### Task 3: Refresh Data
1. Click "Refresh" button (bottom of sidebar)
2. All metrics reload
3. Latest data displayed

#### Task 4: Logout
1. Click "Logout" button (red, bottom of sidebar)
2. Redirected to login page
3. Admin session ended

---

## USER MANAGEMENT

### User Page Overview
Manage all registered student accounts.

### Procedure 1: View All Users

**Steps:**
1. Click "Users" in sidebar
2. All registered students display
3. Each shows:
   - Student name/email
   - View button
   - Enable/Disable button
   - Delete button

**Example View:**
```
Vishal Kumar        vishal@bitsathy.ac.in
[View] [Enable]    [Delete]

Arun Singh          arun@bitsathy.ac.in
[View] [Disable]   [Delete]
```

### Procedure 2: Search for Student

**Steps:**
1. Go to Users page
2. Click on search field
3. Type student email or name: `vishal@bitsathy.ac.in`
4. Click "Search" button
5. Filtered results display

**Search Example:**
```
Input: "vishal"

Results:
☑ Vishal Kumar      vishal@bitsathy.ac.in
☑ Vishal Sharma     vsharma@bitsathy.ac.in
```

### Procedure 3: View Student Profile

**Steps:**
1. Find student in list
2. Click "View" button
3. Profile panel opens showing:
   - Student name
   - Email address
   - Account status (Enabled/Disabled)
   - Join date
   - Courses enrolled

**Profile Display:**
```
Name:     Vishal Kumar
Email:    vishal@bitsathy.ac.in
Status:   Enabled ✓
Joined:   01-03-2026
Courses:  5
```

### Procedure 4: Reset Student Password

**Steps:**
1. View student profile (see previous procedure)
2. Scroll to "Reset password" field
3. Enter new password: Example: `NewPass@2026`
4. Click "Reset Student Password" button
5. System saves new password
6. Student can login with new password

**Verification:**
- ✅ Student receives confirmation
- ✅ Can login with new password

### Procedure 5: Enable/Disable Student Account

**Steps:**
1. Find student in list
2. If enabled (Enabled status shows):
   - Click "Disable" button
   - Student can no longer login
3. If disabled (Disabled status shows):
   - Click "Enable" button
   - Student can login again

**States:**
```
Enabled  ✓  → Student can access system
Disabled ✗  → Student blocked from login
```

### Procedure 6: Delete Student Account

**Steps:**
1. Find student in list
2. Click "Delete" button
3. Confirm deletion
4. Student and all records removed
5. Cannot be undone!

**Warning:**
⚠️  This action is permanent
- Student account deleted
- May lose associated data
- Use with caution

---

## COURSE MANAGEMENT

### Course Page Overview
Create, edit, and manage skill-based courses.

### Procedure 1: Create New Course

**Form Fields to Fill:**

#### Step 1: Course Title
```
Field:  Course Title
Example: Spoken English Basics
Note:    Required
```

#### Step 2: Select Category
```
Choose one:
○ Learning           (General skills)
○ Aptitude          (Ability training)
○ Problem Solving   (Logic & algorithms)
○ Communication     (Speaking, writing)
○ Extra Skill       (Specialized)
○ Custom            (User-defined)

Example: Communication
```

#### Step 3: Custom Category (if selected)
```
Field:  Custom Category Name
Example: Advanced JavaScript
Note:    Only if "Custom" selected above
```

#### Step 4: Description
```
Field:    Course Description
Example:  Improve speaking confidence through 
          practical exercises and interactive sessions
Note:     Required - be detailed
```

#### Step 5: Start Date
```
Field:   Start Date
Example: 01-04-2026
Format:  YYYY-MM-DD or use date picker
Note:    Required
```

#### Step 6: End Date
```
Field:   End Date
Example: 05-04-2026
Format:  YYYY-MM-DD or use date picker
Note:    Must be after start date
```

#### Step 7: Duration (Auto-Calculated)
```
Field:  Duration
Auto:   Calculated from start-end dates
Example: Start 01-04 → End 05-04 = 5 Days
Note:   Read-only field
```

#### Step 8: Difficulty Level
```
Select one:
▼ Beginner        (For new learners)
  Intermediate    (Some experience)
  Advanced        (Experienced)
  Expert          (Mastery level)

Example: Beginner
```

#### Step 9: Add Resource Links

**Link Types:**
```
Type Options:
📹 Video         (YouTube, Vimeo, etc.)
🌐 Website       (Docs, blogs, references)
📄 PDF           (Downloadable materials)
💻 Coding        (LeetCode, HackerRank, etc.)
```

**Steps to Add Link:**
1. Select link type from dropdown: `[Video ▼]`
2. Enter URL in field: `https://youtube.com/...`
3. Click `[+]` button to add
4. Link appears in list below
5. Repeat for multiple links
6. Click `[✕]` to remove link

**Example Links:**
```
📹 https://youtube.com/watch?v=...    [✕]
🌐 https://grammar.com               [✕]
📄 https://example.com/materials.pdf [✕]
```

#### Step 10: Website Reference (Optional)
```
Field:   Website Reference
Example: https://example.com
Note:    Optional - for external reference
```

#### Step 11: Status
```
Select one:
○ Active   (Course is live)
○ Draft    (Course in progress)

Example: Active
Note:    Active courses shown to students
```

### Complete Form Example
```
Course Title:          Spoken English Basics
Category:              Communication
Custom Category:       (empty)
Description:           Improve speaking confidence and 
                       communication skills...
Start Date:            01-04-2026
End Date:              05-04-2026
Duration:              5 Days (Auto-calculated)
Difficulty:            Beginner
Resource Links:
  - Video: https://youtube.com/...
  - Website: https://grammar.com
Website Reference:     (optional)
Status:                Active

[Add Course] [Cancel]
```

### Procedure 2: View All Courses

**Steps:**
1. Go to Courses page
2. Right panel shows "All Courses"
3. List displays all created courses
4. Scroll through list to see all

**Display for Each Course:**
```
Course Title
Category Name
Description (truncated)
Duration: X Days | Difficulty | Dates
Resources: 📹 Video  🌐 Website  +1 more
[Edit] [Delete]
```

### Procedure 3: Edit Course

**Steps:**
1. Find course in "All Courses" list
2. Click "Edit" button
3. Form pre-fills with course data
4. Modify any fields needed
5. Click "Update Course" button
6. Changes saved to Firestore

**Example Edit:**
```
Original: "Spoken English Basics"
Edit to: "Advanced Spoken English"
Click: [Update Course]
✓ Changed successfully
```

### Procedure 4: Delete Course

**Steps:**
1. Find course in list
2. Click "Delete" button
3. Confirm deletion dialog
4. Click "Yes" to confirm
5. Course removed from system

**Warning:**
⚠️  Deleting removes:
- Course definition
- All allocations to students
- Associated assignments
- This cannot be undone!

---

## COURSE ALLOCATION

### Allocation Page Overview
Assign courses to students with specific date ranges.

### Procedure 1: Assign Course to All Students

**Steps:**

#### Step 1: Select Course
1. Go to Allocation page
2. Click "Select Course" dropdown
3. Choose course: Example: `Communication Skill`
4. Course selected

#### Step 2: Set Allocation Dates
1. Click "Start Date" field
2. Enter: `01-04-2026`
3. Click "End Date" field
4. Enter: `07-04-2026`
5. Note: Course available to students during these dates

#### Step 3: Choose Mode
1. Select: `○ Assign to all users`
2. This assigns to all 248 students

#### Step 4: Assign
1. Click "Assign Course" button
2. System processes request
3. Confirmation message appears
4. Course now allocated to all students

**Example:**
```
Course:     Communication Skill
Start:      01-04-2026
End:        07-04-2026
Mode:       All users
Result:     ✓ Assigned to 248 students
```

### Procedure 2: Assign Course to Selected Students

**Steps:**

#### Step 1: Select Course & Dates
(Same as Procedure 1, Steps 1-2)

#### Step 2: Choose Mode
1. Select: `○ Assign selected users`
2. "Select Students" section appears

#### Step 3: Select Students
```
☑ vishal@bitsathy.ac.in
☑ arun@bitsathy.ac.in
☐ rahul@bitsathy.ac.in
☐ priya@bitsathy.ac.in
[Select all visible]

Selected: 2 students
```

1. Click checkboxes next to student emails
2. "Select all visible" to check all shown
3. Count shows: "(2 selected)"

#### Step 4: Assign
1. Click "Assign Course" button
2. Only selected students get course

### Procedure 3: View Existing Allocations

**Steps:**
1. After selecting a course, scroll down
2. "Existing Allocation" section shows
3. Lists all students with course
4. Shows allocation dates:
   ```
   vishal@bitsathy.ac.in
   01-04-2026 to 07-04-2026
   [Remove]
   ```

### Procedure 4: Remove Student from Course

**Steps:**
1. Find student in "Existing Allocation" section
2. Click "Remove" button next to student
3. Student unassigned from course
4. Can reassign later if needed

**Example:**
```
Student:  vishal@bitsathy.ac.in
Dates:    01-04-2026 to 07-04-2026
Action:   Click [Remove]
Result:   ✓ Removed
```

---

## ASSIGNMENT MANAGEMENT

### Assignment Page Overview
Create tasks within courses for student evaluation.

### Procedure 1: Create Assignment

**Form Fields:**

#### Step 1: Title
```
Field:   Assignment Title
Example: Speaking Practice Session
Note:    Required
```

#### Step 2: Description
```
Field:    Description/Instructions
Example:  Record a 2-minute video speaking 
          on assigned topic using clear language
Note:     Required - be detailed
```

#### Step 3: Open Date
```
Field:   Open Date (when available)
Example: 01-04-2026
Note:    When students can start
```

#### Step 4: Due Date
```
Field:   Due Date (deadline)
Example: 03-04-2026
Note:    When students must submit
```

#### Step 5: Assign To
```
Options:
[All Users ▼]
- All Users        (All 248 students)
- Selected Users   (Choose specific)
- By Course        (All in a course)

Example: By Course
```

#### Step 6: Course (If applicable)
```
Field:   Select Course (if assigning by course)
Options: [Communication Skill ▼]
         [Problem Solving ▼]
         [etc.]

Example: Communication Skill
```

### Complete Assignment Example
```
Title:      Speaking Practice
Description: Record 2-minute video speaking on 
            given topic using clear pronunciation
Open Date:  01-04-2026
Due Date:   03-04-2026
Assign To:  By Course
Course:     Communication Skill

[Save Assignment] [Cancel]
```

### Procedure 2: View All Assignments

**Steps:**
1. Go to Assignments page
2. Right panel shows "Assignments"
3. List displays created assignments
4. Each shows:
   ```
   Speaking Practice         [Open]
   Open: 01-04-2026 | Due: 03-04-2026
   Assigned: Communication Skill
   [View] [Edit] [Delete]
   ```

### Procedure 3: Edit Assignment

**Steps:**
1. Find assignment in list
2. Click "Edit" button
3. Form pre-fills with data
4. Modify fields
5. Click "Update Assignment"

### Procedure 4: Delete Assignment

**Steps:**
1. Find assignment in list
2. Click "Delete" button
3. Confirm deletion
4. Assignment removed

---

## ATTENDANCE MANAGEMENT

### Attendance Page Overview
Mark and track daily attendance for courses.

### Procedure 1: Mark Daily Attendance

**Steps:**

#### Step 1: Select Course
```
Field:   Course Dropdown
Example: [Problem Solving ▼]
Action:  Click to expand and select
```

#### Step 2: Select Date
```
Field:   Date Picker
Example: [02-04-2026]
Action:  Click to select attendance date
```

#### Step 3: Load Attendance
1. Click "Load" button
2. List of students in course loads
3. All showing initial state (Absent)

#### Step 4: Mark Students
```
For each student, check if Present:

☑ Vishal Kumar       (Check if present)
☐ Arun Singh         (Leave unchecked if absent)
☑ Rahul Patel        (Check if present)
☐ Priya Sharma       (Absent)
```

1. Click checkbox for each present student
2. Checked = Present, Unchecked = Absent

#### Step 5: Save Attendance
1. Click "Save Attendance" button
2. Records saved to Firestore
3. Confirmation message appears

**Complete Example:**
```
Course:   Problem Solving
Date:     02-04-2026

☑ Vishal Kumar        Present
☐ Arun Singh          Absent
☑ Rahul Patel         Present
☑ Priya Sharma        Present
☐ Neha Gupta          Absent

Attendance Rate: 60% (3/5)

[Save Attendance]
✓ Saved successfully
```

### Procedure 2: View Attendance History

**After saving, records display below:**
```
Vishal Kumar
Date: 02-04-2026 | Status: Present

Arun Singh
Date: 02-04-2026 | Status: Absent
```

---

## PROGRESS TRACKING

### Progress Page Overview
Monitor course completion and student advancement.

### Procedure 1: View Progress Report

**Steps:**

#### Step 1: Select Course (Optional)
```
Field:   Course Filter
Options: [All Courses ▼]
         [Communication Skill ▼]
         [Problem Solving ▼]
         etc.

Example: [Communication Skill]
```

#### Step 2: Select Date (Optional)
```
Field:   Date Filter
Example: [02-04-2026]
```

#### Step 3: Load Progress
1. Click "Track Progress" button
2. Table loads showing students
3. "Records: 248" shows total

#### Step 4: View Report
```
Table Columns:
Student Email          | Status | Progress | Attendance
──────────────────────┼───────┼──────────┼──────────
vishal@bitsathy...     | Comp. | 100%     | Present
arun@bitsathy...       | In Pr.| 60%      | Absent
rahul@bitsathy...      | Comp. | 100%     | Present
priya@bitsathy...      | Pen.  | 20%      | Present
```

**Status Meanings:**
```
Complete     ✓  Student finished all tasks
InProgress   ⏳  Student working on course
Pending      ⏳  Student hasn't started
```

---

## REPORTS & ANALYTICS

### Reports Page Overview
Overall statistics and analytics about entire system.

### Procedure 1: View System Summary

**Statistics Displayed:**
```
Total Users:           248
Active Users:          173 (70%)
Total Courses:         26
Completed Courses:     142
Average Attendance:    82%
```

### Procedure 2: View Course Completion Report

**Shows for Each Course:**
```
Communication Skill
├─ Completed: 20 students
├─ Pending: 5 students
└─ Attendance: 85%

Problem Solving
├─ Completed: 15 students
├─ Pending: 10 students
└─ Attendance: 75%
```

### Procedure 3: View Student Performance

**Top Performers Section:**
```
1. Vishal Kumar        5/5 courses completed
2. Rahul Patel         4/4 courses completed
3. Priya Sharma        5/5 courses completed
```

### Procedure 4: Analyze Metrics

**Key Metrics to Review:**
1. Total Students: Growing or stable?
2. Active Users: How many engaging?
3. Completion Rate: High or low?
4. Attendance: Above 80%?
5. Total Courses: Enough variety?

---

## Daily Admin Checklist ✅

### Morning (9:00 AM)
- [ ] Login to admin account
- [ ] Check Dashboard metrics
- [ ] Review new students/users
- [ ] Check pending assignments

### Mid-Day (2:00 PM)
- [ ] Mark attendance for current course
- [ ] Create new assignment if needed
- [ ] Review student progress

### Evening (5:00 PM)
- [ ] Generate daily report
- [ ] Plan next day's activities
- [ ] Archive completed courses
- [ ] Logout

---

## Common Scenarios

### Scenario 1: New Course Launch
```
1. Create Course (Courses page)
   ├─ Fill all fields
   ├─ Add resources
   └─ Set Status: Active

2. Allocate Students (Allocation page)
   ├─ Select course
   ├─ Set dates
   └─ Assign to all

3. Create Assignment (Assignments page)
   ├─ Add first task
   └─ Set due date

4. Start Tracking
   ├─ Mark daily attendance
   ├─ Monitor progress
   └─ View reports
```

### Scenario 2: Student Issues
```
Student can't login?
1. Users page
2. Find student
3. Check status (Enabled?)
4. Reset password if needed

Student needs course change?
1. Allocation page
2. Remove from old course
3. Assign to new course
```

### Scenario 3: Course Analysis
```
Course completing slowly?
1. Go to Progress page
2. Select course
3. Check completion %
4. Create assignment to boost
5. Check attendance
```

---

## Troubleshooting Guide

| Problem | Solution |
|---------|----------|
| Can't login | Verify credentials: admin@skilldev.com / admin123 |
| Course not showing | Check Status = Active |
| Student not found | Verify email is @bitsathy.ac.in |
| Allocation error | Check dates (end after start) |
| Attendance not saving | Select course and date first |
| Report empty | Ensure data exists first |

---

## Conclusion

This manual covers all admin operations from login to reporting. For questions, refer to:
- `ADMIN_PANEL_COMPLETE_GUIDE.md` - Detailed feature explanations
- `ADVANCED_COURSES_DOCUMENTATION.md` - Course-specific details

**Status**: FULLY OPERATIONAL ✅


# Advanced Courses Management System 📚

## Overview

The Advanced Courses page provides a professional-grade course management system with comprehensive features for creating, updating, and managing educational courses through the admin dashboard.

---

## Features 🚀

### 1. **Advanced Course Creation Form**
   - **Course Title**: Name of the course (required)
   - **Skill Category**: Select from predefined categories or create custom
   - **Description**: Detailed course description (required)
   - **Date Range**: Select start and end dates (required)
   - **Duration**: Auto-calculated in days
   - **Difficulty Level**: Beginner → Intermediate → Advanced → Expert
   - **Resource Links**: Add multiple resources (Video, Website, PDF, Coding Platform)
   - **Website Reference**: Optional reference website URL
   - **Status**: Active or Draft

### 2. **Skill Categories**
Choose from these predefined categories or create custom ones:
- **Learning** - General learning courses
- **Aptitude** - Aptitude training
- **Problem Solving** - Logic and problem-solving skills
- **Communication** - Communication skills
- **Extra Skill** - Additional specialized skills
- **Custom** - Define your own skill category

### 3. **Resource Management**
Add multiple resource links to each course:
- **Video Links**: YouTube or video tutorials
- **Website Links**: Reference websites or documentation
- **PDF Links**: Downloadable PDFs and materials
- **Coding Platform Links**: LeetCode, CodeChef, HackerRank, etc.

### 4. **Auto-Calculation Features**
- **Duration Auto-Calculation**: Automatically calculates days between start and end dates
- Example: Start: 01-04-2026 → End: 05-04-2026 = 5 Days

### 5. **Course Display**
Each course card shows:
- Course Title
- Category (including custom categories)
- Duration in days
- Difficulty level
- Date range
- Status badge (Active/Draft)
- Resource links preview
- Edit and Delete actions

---

## Backend Data Structure

### Firestore Collection: `courses`

```json
{
  "id": "unique-course-id",
  "title": "Spoken English Basics",
  "course_name": "Spoken English Basics",
  "category": "communication",
  "customCategory": "",
  "description": "Improve speaking confidence and communication skills",
  "startDate": "2026-04-01",
  "endDate": "2026-04-05",
  "durationDays": 5,
  "difficulty": "Beginner",
  "links": [
    {
      "url": "https://youtube.com/watch?v=...",
      "type": "video"
    },
    {
      "url": "https://grammar.com",
      "type": "website"
    }
  ],
  "websiteRef": "https://example.com",
  "status": "Active",
  "createdAt": "2026-04-01T10:30:00.000Z",
  "updatedAt": "2026-04-01T10:30:00.000Z"
}
```

### Field Descriptions
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | String | Yes | Course name |
| `category` | String | Yes | Skill category ID |
| `customCategory` | String | No | Custom category name (if category === "custom") |
| `description` | String | Yes | Course description |
| `startDate` | Date | Yes | Course start date (YYYY-MM-DD) |
| `endDate` | Date | Yes | Course end date (YYYY-MM-DD) |
| `durationDays` | Number | Yes | Auto-calculated duration in days |
| `difficulty` | String | Yes | Beginner \| Intermediate \| Advanced \| Expert |
| `links` | Array | No | Resource links array |
| `links[].url` | String | Yes (if links added) | Link URL |
| `links[].type` | String | Yes (if links added) | video \| website \| pdf \| coding |
| `websiteRef` | String | No | Optional reference website |
| `status` | String | Yes | Active \| Draft |
| `createdAt` | Timestamp | Auto | Course creation timestamp |
| `updatedAt` | Timestamp | Auto | Last update timestamp |

---

## Admin Workflow 🔄

### Step 1: Create Course
1. Click **"Create New Course"** button on Courses page
2. Fill in course title and description
3. Select skill category (or create custom)
4. Set start and end dates
5. Choose difficulty level
6. Add resource links (optional)
7. Set status (Active/Draft)
8. Click **"Add Course"** to save

### Step 2: View Courses
- All courses displayed in list view
- Sort by status (Active/Draft)
- Quick view of duration, difficulty, and dates
- Resource link counts displayed

### Step 3: Edit Course
1. Click **"Edit"** button on course card
2. Modify any fields
3. Update resource links as needed
4. Click **"Update Course"** to save changes

### Step 4: Delete Course
1. Click **"Delete"** button on course card
2. Confirm deletion
3. Course removed from Firestore

### Step 5: Assign to Students
1. Go to **Allocation** page
2. Select the course from dropdown
3. Set allocation dates
4. Assign to all students or selected students
5. Click **"Assign Course"**

---

## API Endpoints

### Create Course
```bash
POST /api/admin/courses
Content-Type: application/json

{
  "title": "Spoken English Basics",
  "category": "communication",
  "customCategory": "",
  "description": "Improve speaking confidence",
  "startDate": "2026-04-01",
  "endDate": "2026-04-05",
  "durationDays": 5,
  "difficulty": "Beginner",
  "links": [],
  "websiteRef": "",
  "status": "Active"
}

Response: { "ok": true, "id": "course-id" }
```

### List Courses
```bash
GET /api/admin/courses

Response: {
  "ok": true,
  "items": [
    {
      "id": "...",
      "title": "...",
      "category": "...",
      ...
    }
  ]
}
```

### Update Course
```bash
PUT /api/admin/courses/:courseId
Content-Type: application/json

{
  "title": "Updated Title",
  "description": "Updated description",
  ...
}

Response: { "ok": true }
```

### Delete Course
```bash
DELETE /api/admin/courses/:courseId

Response: { "ok": true }
```

---

## Frontend Components

### AdminCourses Component (`src/pages/AdminCourses.jsx`)
Main component for course management with two sections:

**Props:**
- `courses`: Array of course objects
- `editingId`: Currently editing course ID
- `status`: Status message
- `isSaving`: Loading state
- `onSave`: Callback function for saving courses
- `onDelete`: Callback function for deleting courses
- `onEdit`: Callback function for editing courses

**Features:**
- Dynamic form with validation
- Auto-duration calculation
- Multiple resource link management
- Course list with filtering
- Responsive design

---

## Example Courses

### Example 1: Communication Course
```json
{
  "title": "Spoken English Basics",
  "category": "communication",
  "description": "Improve speaking confidence and communication skills",
  "startDate": "2026-04-01",
  "endDate": "2026-04-05",
  "durationDays": 5,
  "difficulty": "Beginner",
  "links": [
    {"url": "https://youtube.com/...", "type": "video"},
    {"url": "https://grammar.com", "type": "website"}
  ],
  "status": "Active"
}
```

### Example 2: Custom Problem-Solving Course
```json
{
  "title": "Advanced Data Structures",
  "category": "custom",
  "customCategory": "Data Structures & Algorithms",
  "description": "Master advanced data structures and algorithmic problem solving",
  "startDate": "2026-04-15",
  "endDate": "2026-05-15",
  "durationDays": 30,
  "difficulty": "Advanced",
  "links": [
    {"url": "https://leetcode.com", "type": "coding"},
    {"url": "https://youtube.com/...", "type": "video"}
  ],
  "websiteRef": "https://www.algostudy.com",
  "status": "Active"
}
```

---

## Student View (`AllocatedCourses.jsx`)

Students see:
- **Course Name**
- **Category** (Communication, Learning, etc.)
- **Duration** in days
- **Date Range** (01-04-2026 to 05-04-2026)
- **Status** (Active/Upcoming/Expired)
- **Resources** Count

Example Student View:
```
Communication Skill
Spoken English Basics
Duration: 5 Days
01-04-2026 to 05-04-2026

Resources:
• Video Link
• Website Link
```

---

## Validation Rules ✅

### Course Creation
1. **Title**: Required, must be non-empty string
2. **Description**: Required, must be non-empty string
3. **Start Date**: Required, valid date format
4. **End Date**: Required, must be after start date
5. **Difficulty**: Required, one of predefined levels
6. **Category**: Required, one of predefined or custom
7. **Custom Category**: Required if category is "custom"
8. **Links**: Each link must have valid URL

### Date Validation
- Start date must be before end date
- Both dates required for course creation
- Duration auto-calculated from dates

---

## Best Practices 📋

1. **Use Clear Titles**: Make course titles descriptive and searchable
2. **Detailed Descriptions**: Provide comprehensive course objectives
3. **Set Realistic Dates**: Plan courses with appropriate duration
4. **Add Resources**: Include multiple resource links for student support
5. **Status Management**: Use Draft for planning, Active for live courses
6. **Categories**: Use predefined categories when possible, custom only when necessary
7. **Difficulty Levels**: Accurately assign difficulty to match student prerequisites

---

## Backward Compatibility 🔄

The system maintains backward compatibility with older courses that only have:
- `course_name` (now also stored as `title`)
- `description`

The system automatically uses `course.title || course.course_name` for display, ensuring existing courses continue to work.

---

## Troubleshooting

### Issue: Duration not calculating
- **Cause**: Invalid date format or missing dates
- **Solution**: Ensure both start and end dates are selected

### Issue: Cannot save course
- **Cause**: Missing required fields
- **Solution**: Check validation errors and fill all required fields (title, description, dates)

### Issue: Resource links not saving
- **Cause**: Invalid URL format
- **Solution**: Ensure URLs start with `http://` or `https://`

### Issue: Course not appearing in allocations
- **Cause**: Course status is "Draft" or not yet saved
- **Solution**: Set course status to "Active" and refresh the page

---

## Future Enhancements 🌟

Potential improvements for future versions:
- Course prerequisites and dependencies
- Course tags for advanced filtering
- Course progress tracking
- Completion certificates
- Student feedback/ratings
- Course capacity limits
- Batch course upload/import
- Course templates
- Advanced analytics and reporting

---

## Conclusion

The Advanced Courses Management System provides admins with a powerful, user-friendly interface to create and manage professional-grade educational courses with flexible categorization, resource management, and comprehensive course metadata.


# Role Permissions and Workflow

## System Roles

- Administrator: full control
- Student: limited control (personal skills only)

## Permission Matrix

| Feature | Student | Admin |
|---|---|---|
| Add personal skill | Yes | No |
| Edit personal skill | Yes | No |
| Delete personal skill | Yes | No |
| View assigned course | Yes | Yes |
| Edit assigned course | No | Yes |
| Remove assigned course | No | Yes |
| Assign course | No | Yes |
| Set allocation dates | No | Yes |
| Add/remove students to course | No | Yes |

## Student Rules

- Students can only manage personal skills in the skills module.
- Students cannot modify admin-assigned course allocations.
- Student login is restricted to registered student profiles.

## Admin Rules

- Admin can create/edit/delete courses.
- Admin can assign courses to all or selected registered students.
- Admin must provide allocation `startDate` and `endDate`.
- Admin can remove students from allocated course lists.
- Admin can monitor progress and attendance.

## Allocation Workflow

1. Admin logs in.
2. Admin selects course.
3. Admin sets start and end dates.
4. Admin selects registered students.
5. Admin assigns course.
6. Students view assigned course within allocation period.
7. Admin updates allocations (add/remove students, extend end date) when required.

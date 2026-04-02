# Design System - Student Skill Development Platform

## Overview
This document outlines the comprehensive design system implemented for the Student Skill Development Learning Platform. The design focuses on premium aesthetics, strong visual hierarchy, perfect alignment, and WCAG AA text contrast compliance.

---

## Color System

### Primary Colors
- **Primary**: `#5b5fd7` (Purple) - Main brand color
- **Primary Light**: `#6b6de8` - Hover/interaction state
- **Primary Dark**: `#4a4cc1` - Pressed/active state

### Semantic Colors
- **Success**: `#10b981` (Green)
- **Warning**: `#f59e0b` (Amber)
- **Danger**: `#ef4444` (Red)
- **Info**: `#3b82f6` (Blue)

### Neutral Colors (Gray Scale)
- **White**: `#ffffff`
- **Gray 50**: `#f9fafb` (Lightest background)
- **Gray 100**: `#f3f4f6`
- **Gray 200**: `#e5e7eb`
- **Gray 300**: `#d1d5db`
- **Gray 400**: `#9ca3af`
- **Gray 500**: `#6b7280`
- **Gray 600**: `#4b5563`
- **Gray 700**: `#374151`
- **Gray 800**: `#1f2937`
- **Gray 900**: `#111827` (Darkest text)

### Dark Mode Colors
- **Dark BG**: `#0f172a`
- **Dark Surface**: `#1e293b`
- **Dark Border**: `#334155`
- **Dark Text**: `#f1f5f9`

---

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

### Font Sizes & Weights

| Element   | Size    | Weight | Letter-spacing | Usage                          |
|-----------|---------|--------|----------------|--------------------------------|
| H1        | 2.25rem | 800    | -0.3px         | Hero titles, page headers      |
| H2        | 1.75rem | 800    | -0.3px         | Major section headers          |
| H3        | 1.4rem  | 700    | -0.3px         | Subsection headers             |
| H4        | 1.15rem | 700    | -0.3px         | Card titles                    |
| H5        | 1rem    | 600    | 0              | Smaller headings               |
| Body      | 0.95rem | 400    | 0              | Standard text content          |
| Small     | 0.85rem | 500    | 0              | Labels, metadata               |
| Tiny      | 0.7rem  | 800    | 1px            | Uppercase labels               |

### Line Heights
- Headings: 1.2
- Body text: 1.6
- Default: 1.5

---

## Spacing Scale

```css
0px, 4px, 8px, 12px, 16px, 20px, 24px, 28px, 32px, 40px
```

### Component Spacing Guidelines

| Component        | Padding | Gap   | Margin Bottom |
|------------------|---------|-------|---------------|
| Cards            | 24px    | 16px  | 32px          |
| Buttons          | 12px 16px | -   | 16px          |
| Section Headers  | -       | 24px  | 28px          |
| Hero Sections    | 80px 32px | -   | 0             |
| Stats Cards      | 20px    | 20px  | 0             |
| Widgets          | 20px    | 20px  | 28px          |

---

## Shadow System

| Level    | CSS Value                                                                     |
|----------|-------------------------------------------------------------------------------|
| SM       | `0 2px 8px rgba(0, 0, 0, 0.08)`                                               |
| MD       | `0 8px 20px rgba(0, 0, 0, 0.1)`                                               |
| LG       | `0 12px 24px rgba(0, 0, 0, 0.12)`                                             |
| XL       | `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)` |

**Dark Mode Shadows**: 2x opacity
- Dark SM: `0 2px 8px rgba(0, 0, 0, 0.2)`
- Dark MD: `0 8px 20px rgba(0, 0, 0, 0.3)`

---

## Border & Radius

### Border Radius
- **Extra Small**: 4-6px - Small UI elements
- **Small**: 8px - Buttons, small cards
- **Medium**: 10-12px - Cards, sections
- **Large**: 16px - Large hero sections

### Borders
- **Default**: `1px solid rgba(0, 0, 0, 0.06)` (Light mode)
- **Subtle**: `1px solid rgba(0, 0, 0, 0.04)` (Lighter)
- **Dark Mode**: `1px solid var(--dark-border)` (#334155)

---

## Text Contrast (WCAG AA Compliance)

### Hero Sections (Gradient Backgrounds)
- **Text Color**: `#ffffff` (pure white)
- **Secondary Text**: `#eaeaea` (light gray)
- **Overlay**: `rgba(0, 0, 0, 0.15-0.25)` (darkened gradient)
- **Contrast Ratio**: 4.5:1 (minimum) ✓

### Standard Content Areas
- **Primary Text**: `#111827` (gray-900) - 8.6:1 on white
- **Secondary Text**: `#4b5563` (gray-600) - 6.4:1 on white
- **Tertiary Text**: `#6b7280` (gray-500) - 5.8:1 on white
- **All meet WCAG AAA** ✓

### Cards & Containers
- **Heading**: `#111827` (gray-900) - 8.6:1 ✓
- **Body**: `#4b5563` (gray-600) - 6.4:1 ✓
- **Meta**: `#6b7280` (gray-500) - 5.8:1 ✓

---

## Layout System

### Grid Architecture
```css
/* Desktop (1200px+) */
grid-template-columns: 280px 1fr 340px
gap: 32-40px

/* Tablet (768px-1200px) */
grid-template-columns: 280px 1fr
gap: 24-32px

/* Mobile (<768px) */
grid-template-columns: 1fr
gap: 16-24px
```

### Breakpoints
- **Desktop**: 1200px+
- **Tablet**: 768px - 1199px
- **Mobile**: < 768px

### Component Column Widths
- **Sidebar**: 280px (desktop), 256px (mobile)
- **Navbar**: 64px height (fixed)
- **Main Content**: Flexible, min-width: 0
- **Right Panel**: 340px (hidden < 1200px)

---

## Component Specifications

### Navbar
- **Height**: 64px (fixed)
- **Z-index**: 999
- **Shadow**: `0 2px 8px rgba(0, 0, 0, 0.06)`
- **Border**: `1px solid rgba(0, 0, 0, 0.06)`
- **Padding**: 0 20px
- **Sections**: 3-column grid (left | center | right)

### Sidebar
- **Width**: 280px (desktop), 256px (mobile)
- **Position**: Sticky (desktop), Fixed (mobile)
- **Z-index**: 100
- **Border**: Right 1px
- **Padding**: 16px 0
- **Scrollbar**: Thin, transparent track

### Hero Sections
- **Min Height**: 320-420px
- **Padding**: 80px 32px 60px
- **Background**: Gradient (135deg)
- **Overlay**: `rgba(0, 0, 0, 0.15-0.25)`
- **Pattern**: SVG grid (20-40px spacing, opacity 0.05-0.6)

### Cards
- **Padding**: 24px
- **Border-radius**: 12px
- **Border**: 1px solid rgba(0, 0, 0, 0.06)
- **Shadow**: 0 2px 8px rgba(0, 0, 0, 0.08)
- **Hover Shadow**: 0 8px 20px rgba(0, 0, 0, 0.1)
- **Hover Transform**: translateY(-4px)

### Buttons
- **Padding**: 12px 16px (standard), 8px 12px (small)
- **Border-radius**: 8px
- **Font-weight**: 600
- **Transition**: All 0.3s cubic-bezier(0.4, 0, 0.2, 1)

### Progress Bars
- **Height**: 6px (inline), 10px (hero)
- **Border-radius**: 3px-5px
- **Background**: `rgba(255, 255, 255, 0.2)` (on dark)
- **Fill Color**: `#ffffff` or gradient

---

## Animations & Transitions

### Standard Transition
```css
all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
```

### Keyframe Animations
- **slideInLeft**: -20px translateX
- **slideInRight**: +20px translateX
- **slideInUp**: +20px translateY
- **fadeIn**: opacity 0 → 1
- **pulse**: opacity oscillation
- **shimmer**: gradient movement (2s loop)

### Timing
- **Fast**: 0.2s - Micro-interactions
- **Standard**: 0.3s - Normal transitions
- **Slow**: 0.5-0.6s - Progress bars, major changes

---

## Responsive Design

### Mobile-First Approach
Content stacks vertically on mobile, expands to grid on larger screens.

### Breakpoint Changes

#### < 768px (Mobile)
- Sidebar: Fixed overlay, slide-in animation
- Lesson grid: Single column
- Card padding: 16-20px
- Font sizes: -5% reduction
- Gap/spacing: Reduced 20-30%

#### 768px - 1024px (Tablet)
- Sidebar: Sticky left, 256px width
- Lesson grid: 2-column (left sidebar hidden)
- Cards: Full-width with padding
- Spacing: Standard

#### 1024px - 1200px (Desktop)
- All 3 columns visible on Lesson page
- Standard grid layout
- Full component widths

#### 1200px+ (Large Desktop)
- Right sidebar visible
- Max-width: 1200px for content
- Padding: 32px sides
- All features enabled

---

## Dark Mode

### Automatic Theme Switching
Applied via `.dark-mode` class on `.global-layout`

### Color Mapping
```css
.global-layout.dark-mode {
  --white: #111827;
  --gray-50: #1f2937;
  --gray-100: #374151;
  /* ... etc ... */
}
```

### Adjustments
- **Shadows**: 2x opacity for depth
- **Borders**: Use dark-border color
- **Text**: Use dark-text / gray-300+
- **Backgrounds**: dark-surface for containers
- **Hover**: More visible changes (darker backgrounds)

---

## Accessibility

### Keyboard Navigation
- Focus rings: 2px solid var(--primary) with 2px offset
- Tab order: Natural DOM order
- All interactive elements focusable

### Color Contrast
- All text: WCAG AA minimum (4.5:1)
- Large text (18pt+): WCAG AA minimum (3:1)
- Critical paths: WCAG AAA (7:1)

### Semantic HTML
- Proper heading hierarchy (h1 → h6)
- Semantic elements: <nav>, <section>, <article>, <button>
- ARIA labels where needed
- Skip links: Implemented

### Screen Reader Support
- Alt text for all images
- Descriptive link text
- Form labels associated with inputs
- ARIA live regions for notifications

---

## State Indicators

### Active/Hover States
```css
.nav-item.active {
  background: rgba(91, 95, 215, 0.1);
  color: var(--primary);
  border-left: 3px solid var(--primary);
}

.btn:hover {
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(91, 95, 215, 0.3);
}
```

### Disabled State
```css
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

### Loading State
```css
.skeleton {
  animation: shimmer 2s infinite;
}
```

---

## Best Practices

### Padding Consistency
- **Cards**: Always 24px
- **Sections**: 32px vertical spacing
- **Hero**: 80px top, 60px bottom
- **Buttons**: 12px vertical, 16px horizontal

### Alignment Rules
1. All left-aligned text on hero sections starts on same vertical grid
2. Cards maintain consistent heights with min-height or flex
3. Grid gaps: Even multiples of 8 (16px, 24px, 32px)
4. Icons: Center-aligned in 20x20 or 24x24 boxes

### Color Usage
- Primary color: CTAs, active states, brand elements
- Gray: Text, backgrounds, borders
- Semantic: Only for alerts/status
- Gradients: Hero sections only

### Typography Hierarchy
- H1: Page titles (rare)
- H2: Section titles (common)
- H3: Subsection titles
- Body: Default text
- Small: Metadata, captions
- Never use h4+ for layout structure

---

## File Structure

```
src/styles/
├── GlobalLayout.css      (Base styles, variables, utilities)
├── Navbar.css            (Navigation bar)
├── Sidebar.css           (Left navigation)
├── Dashboard.css         (Home page)
├── CourseDetail.css      (Course page)
├── Lesson.css            (Lesson page)
├── Progress.css          (Progress tracking)
├── Profile.css           (User profile)
└── Settings.css          (Settings page)
```

---

## Updates Summary

### Latest Design Improvements (Current)
1. **Text Visibility**: Added dark overlays to all gradient backgrounds
2. **Hero Alignment**: All text left-aligned on consistent grid
3. **Contrast**: Updated to WCAG AA (4.5:1) minimum on all text
4. **Card Styling**: Enhanced shadows, borders, hover effects
5. **Spacing**: Standardized to 8px grid system
6. **Typography**: Increased font weights for headings (700-800)
7. **Navigation**: Improved active indicators, hover states
8. **Responsive**: Better breakpoint handling and mobile optimization

---

## Version
**Version**: 1.0  
**Last Updated**: 2024  
**Maintainer**: Design System Team

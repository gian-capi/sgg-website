# CLAUDE.md — Signature Gallery Group Admin & Analytics Manager

## Project Overview
Build a lightweight, backend admin management system (Shopify-style admin) for **Signature Gallery Group (SGG)**. The backend will allow administrators to manage dynamic content (Artists, Artworks, Upcoming Events, Galleries), track traffic and inquiries, and push updates to the site.

---

## Technical Stack & Architecture
- **Backend Framework**: Node.js with Express.js (or Next.js App Router).
- **Database**: SQLite (via Prisma or Better-SQLite3) for local/lightweight storage, or PostgreSQL.
- **Frontend Styling**: Match existing dark luxury aesthetic (TailwindCSS, custom colors `taste1: #3D2B68`, `taste2: #9089D3`, typography: `Geist`, `Archivo`, `Geist Mono`).
- **Authentication**: Session-based or JWT authentication (Admin login with role-based access).

---

## Core System Modules

### 1. Catalog & Content Management (CMS)
- **Artists CRUD**: Add, edit, archive artists. Manage bios, profile images (`images/artists/<slug>/_card.jpg`), and work counts.
- **Artwork & New Releases**: Upload new artworks, attach to artists, update dimensions, medium, title, and release carousel status.
- **Events & Art Shows**: Create upcoming shows with date chips, location mapping, featured artist links, and custom banner images (`images/events/`).
- **Galleries Directory**: Edit gallery details, operating hours, direct phone numbers, and fine art consultant listings.

### 2. Performance & Reporting Analytics
- **Pageview & Click Tracking**: Light analytics tracking views on individual artist pages, event pages, and artwork modals.
- **Inquiry Management**: Capture and store contact form submissions (`info@signaturegalleries.com` form entries) with status flags (New, Contacted, Closed).
- **Top Performers Report**: Metrics table displaying most viewed artists, highest interest artworks, and event conversion rates.

### 3. Website Configuration Controls
- **Hero Slider Controls**: Reorder or swap hero slides, CTA links, and homepage showcase artwork.
- **Gallery Info FAQ Editor**: Manage accordion questions and answers live on `index.html`.

---

## Database Schema Model Guidelines

```prisma
model Artist {
  id          String    @id @default(uuid())
  name        String
  slug        String    @unique
  specialty   String
  bio         String?
  cardImage   String
  artworks    Artwork[]
  events      Event[]
}

model Artwork {
  id          String   @id @default(uuid())
  title       String
  artistId    String
  artist      Artist   @relation(fields: [artistId], references: [id])
  medium      String?
  dimensions  String?
  imagePath   String
  isRelease   Boolean  @default(false)
  viewsCount  Int      @default(0)
}

model Event {
  id          String   @id @default(uuid())
  title       String
  startDate   DateTime
  location    String
  bannerImage String
  artistId    String?
  artist      Artist?  @relation(fields: [artistId], references: [id])
}

model Inquiry {
  id        String   @id @default(uuid())
  email     String
  type      String   @default("Newsletter")
  status    String   @default("Pending")
  createdAt DateTime @default(now())
}
```

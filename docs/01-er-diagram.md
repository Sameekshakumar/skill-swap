# ER diagram

Six tables in `public`, plus `_prisma_migrations` which Prisma manages and is not
part of the design.

```mermaid
erDiagram
    USER ||--o{ SKILL : "offers to teach"
    USER ||--o{ SKILLTOLEARN : "wants to learn"
    USER ||--o{ BOOKING : "teaches"
    USER ||--o{ BOOKING : "learns"
    USER ||--o{ TRANSACTION : "owns ledger row"
    USER ||--o{ REVIEW : "writes"
    USER ||--o{ REVIEW : "receives"
    SKILL ||--o{ BOOKING : "is booked as"
    BOOKING ||--o{ TRANSACTION : "moves credits for"
    BOOKING ||--o{ REVIEW : "is reviewed in"

    USER {
        string id PK "uuid"
        string email UK "unique, lowercased"
        string passwordHash "bcrypt, never returned by the API"
        enum   role "user | admin"
        enum   status "active | suspended"
        string name
        string college
        string yearOfStudy
        string bio
        string avatarUrl
        int    creditBalance "default 10"
        float  rating "maintained by trigger"
        int    reviewCount "maintained by trigger"
        datetime createdAt
        datetime updatedAt
    }

    SKILL {
        string id PK "uuid"
        string userId FK "-> USER.id, ON DELETE CASCADE"
        string skillName
        string description
        enum   level "Beginner | Intermediate | Advanced | Expert"
        int    creditsPerHour "1..3"
        vector embedding "vector(384), pgvector"
        datetime createdAt
        datetime updatedAt
    }

    SKILLTOLEARN {
        string id PK "uuid"
        string userId FK "-> USER.id, ON DELETE CASCADE"
        string skillName "UNIQUE(userId, skillName)"
        datetime createdAt
    }

    BOOKING {
        string id PK "uuid"
        string teacherId FK "-> USER.id, RESTRICT"
        string learnerId FK "-> USER.id, RESTRICT"
        string skillId FK "-> SKILL.id, ON DELETE SET NULL"
        string skill "name copied at booking time"
        enum   status "Requested | Confirmed | Completed | Cancelled"
        int    creditAmount "price x hours, from the teacher's Skill row"
        datetime dateTime "must be in the future"
        int    duration "whole hours, 1..3"
        bool   completedByLearner
        bool   completedByTeacher
        enum   cancelledBy "learner | teacher | admin"
        string notes
        datetime createdAt
        datetime updatedAt
    }

    TRANSACTION {
        string id PK "uuid"
        string userId FK "-> USER.id, ON DELETE CASCADE"
        string bookingId FK "-> BOOKING.id, ON DELETE SET NULL"
        enum   type "Initial | Lock | Transfer | Refund | Adjustment"
        int    amount "signed: negative debits, positive credits"
        string description
        datetime createdAt
        datetime updatedAt
    }

    REVIEW {
        string id PK "uuid"
        string reviewerId FK "-> USER.id, ON DELETE CASCADE"
        string revieweeId FK "-> USER.id, ON DELETE CASCADE"
        string bookingId FK "-> BOOKING.id, ON DELETE CASCADE"
        int    rating "1..5"
        string comment
        string skill
        datetime createdAt
        datetime updatedAt
    }
```

## Relationships, in words

| From | To | Kind | Notes |
|------|----|------|-------|
| User | Skill | 1 : N | What a person teaches. Deleting the user deletes their listings. |
| User | SkillToLearn | 1 : N | What a person wants to learn. `UNIQUE(userId, skillName)` stops duplicates. |
| User | Booking | 1 : N, **twice** | Once as `teacherId`, once as `learnerId`. The same table holds both roles, so one person can teach some sessions and learn in others. |
| Skill | Booking | 1 : N | Nullable. The booking also stores the skill *name*, so history survives the listing being deleted. |
| User | Transaction | 1 : N | The credit ledger. Every balance change writes a row. |
| Booking | Transaction | 1 : N | Nullable — an admin credit adjustment belongs to no booking. |
| User | Review | 1 : N, **twice** | `reviewerId` (written) and `revieweeId` (received). |
| Booking | Review | 1 : N | `UNIQUE(bookingId, reviewerId)` allows at most one review per person per session — so a session yields at most two. |

## Two things worth pointing out

**`Booking` has two foreign keys to the same table.** `teacherId` and `learnerId`
both reference `User.id`. That is what makes a peer-to-peer exchange possible
rather than a one-way tutoring site: there is no separate "teacher" table,
because everybody is both.

**`Booking.teacherId` and `Booking.learnerId` are RESTRICT, not CASCADE.** Every
other foreign key to `User` cascades. These two deliberately do not: deleting
somebody mid-session would erase the other party's history and the credits
attached to it. The application turns the resulting error into a 409 and tells
the admin to suspend the account instead.

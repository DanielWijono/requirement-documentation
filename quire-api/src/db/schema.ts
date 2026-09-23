import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

// ---------------------------------------------------------------------------
// Accounts. `user`, `session`, `account` and `verification` follow Better Auth's schema.

export const user = pgTable('user', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  colorSeed: integer('color_seed').notNull().default(0),
  siteRole: text('site_role', { enum: ['admin', 'member'] }).notNull().default('member'),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
})

export const session = pgTable(
  'session',
  {
    id: id(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/** Invite-only sign-up: an admin invites an email address; the link carries a token whose hash is stored here. */
export const invites = pgTable(
  'invites',
  {
    id: id(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    siteRole: text('site_role', { enum: ['admin', 'member'] }).notNull().default('member'),
    invitedById: text('invited_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('invites_email_lower', sql`${t.email} = lower(${t.email})`)],
)

/** Every active user is implicitly in the system `group.members` group; other groups list members explicitly. */
export const groups = pgTable('groups', {
  id: id(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: createdAt(),
})

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user_idx').on(t.userId)],
)

// ---------------------------------------------------------------------------
// Spaces

export const PRINCIPAL_TYPES = ['user', 'group'] as const

export const spaces = pgTable(
  'spaces',
  {
    id: id(),
    /** Stored upper case; the API normalizes input. */
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('📁'),
    description: text('description').notNull().default(''),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [check('spaces_key_format', sql`${t.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`)],
)

/** The space permission matrix (§8.8): one row per principal with the permissions granted to it. */
export const spacePermissions = pgTable(
  'space_permissions',
  {
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    principalType: text('principal_type', { enum: PRINCIPAL_TYPES }).notNull(),
    principalId: text('principal_id').notNull(),
    perms: text('perms').array().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.principalType, t.principalId] }),
    index('space_permissions_principal_idx').on(t.principalType, t.principalId),
    check('space_permissions_known', sql`${t.perms} <@ array['View','Add','Edit','Delete','Comment','Admin']`),
  ],
)

// ---------------------------------------------------------------------------
// Pages

export const PAGE_STATUSES = ['draft', 'published', 'archived', 'deleted'] as const

export const pages = pgTable(
  'pages',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnyPgColumn => pages.id, { onDelete: 'cascade' }),
    /** Sort order among siblings; new pages go after the last one, moves take the midpoint. */
    position: doublePrecision('position').notNull().default(0),
    title: text('title').notNull(),
    icon: text('icon'),
    status: text('status', { enum: PAGE_STATUSES }).notNull().default('draft'),
    /** Status before archive or delete, so restore puts the page back as it was. */
    statusBeforeTrash: text('status_before_trash', { enum: ['draft', 'published'] }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id),
    updatedById: text('updated_by_id')
      .notNull()
      .references(() => user.id),
    /** Body as of the last publish; null until the first publish. */
    publishedHtml: text('published_html'),
    publishedVersion: integer('published_version').notNull().default(0),
    /** Optimistic-concurrency token (ETag): bumped on every publish or metadata change. */
    lockVersion: integer('lock_version').notNull().default(0),
    /** Plain text of the published body, for search. */
    bodyText: text('body_text').notNull().default(''),
    wordCount: integer('word_count').notNull().default(0),
    widthMode: text('width_mode', { enum: ['reading', 'wide', 'full'] }).notNull().default('reading'),
    isBlogPost: boolean('is_blog_post').notNull().default(false),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(body_text, '')), 'B')`,
    ),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('pages_space_parent_idx').on(t.spaceId, t.parentId, t.position),
    index('pages_parent_idx').on(t.parentId),
    index('pages_search_idx').using('gin', t.search),
    index('pages_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    check('pages_not_own_parent', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
)

/** The working copy: unpublished changes to a published page, or the body of a page never published. */
export const pageDrafts = pgTable('page_drafts', {
  pageId: text('page_id')
    .primaryKey()
    .references(() => pages.id, { onDelete: 'cascade' }),
  html: text('html').notNull(),
  /** Bumped on every draft save; clients send it back in If-Match. */
  rev: integer('rev').notNull().default(1),
  updatedById: text('updated_by_id')
    .notNull()
    .references(() => user.id),
  updatedAt: updatedAt(),
})

export const pageVersions = pgTable(
  'page_versions',
  {
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Null for versions imported without a snapshot. */
    html: text('html'),
    title: text('title').notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    comment: text('comment').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.version] })],
)

/** Page restrictions (§8.7). View lists are inherited by descendants; edit lists apply to this page only. */
export const pageRestrictions = pgTable(
  'page_restrictions',
  {
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['view', 'edit'] }).notNull(),
    principalType: text('principal_type', { enum: PRINCIPAL_TYPES }).notNull(),
    principalId: text('principal_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.kind, t.principalType, t.principalId] })],
)

/** People invited to see and edit a draft before it is published (§6.3). */
export const pageCollaborators = pgTable(
  'page_collaborators',
  {
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.userId] })],
)

export const comments = pgTable(
  'comments',
  {
    id: id(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    /** Replies point at a top-level comment; a trigger keeps threads one level deep. */
    parentId: text('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    body: text('body').notNull(),
    anchorText: text('anchor_text'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('comments_page_idx').on(t.pageId, t.createdAt), index('comments_parent_idx').on(t.parentId)],
)

export const pageLabels = pgTable(
  'page_labels',
  {
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.name] }),
    index('page_labels_name_idx').on(t.name),
    check('page_labels_format', sql`${t.name} ~ '^[a-z0-9][a-z0-9_-]{0,49}$'`),
  ],
)

// ---------------------------------------------------------------------------
// Per-user state

const perUser = () =>
  text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
const spaceRef = () =>
  text('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' })
const pageRef = () =>
  text('page_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' })

export const spaceStars = pgTable('space_stars', { userId: perUser(), spaceId: spaceRef(), createdAt: createdAt() }, (t) => [
  primaryKey({ columns: [t.userId, t.spaceId] }),
])

export const pageStars = pgTable('page_stars', { userId: perUser(), pageId: pageRef(), createdAt: createdAt() }, (t) => [
  primaryKey({ columns: [t.userId, t.pageId] }),
])

export const spaceWatches = pgTable('space_watches', { userId: perUser(), spaceId: spaceRef(), createdAt: createdAt() }, (t) => [
  primaryKey({ columns: [t.userId, t.spaceId] }),
])

export const pageWatches = pgTable('page_watches', { userId: perUser(), pageId: pageRef(), createdAt: createdAt() }, (t) => [
  primaryKey({ columns: [t.userId, t.pageId] }),
])

export const recentViews = pgTable(
  'recent_views',
  {
    userId: perUser(),
    pageId: pageRef(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pageId] }), index('recent_views_user_idx').on(t.userId, t.viewedAt)],
)

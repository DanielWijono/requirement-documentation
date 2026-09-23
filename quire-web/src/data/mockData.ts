import type { Comment, Page, PageTreeNode, Space, User } from '../types'

export const users: User[] = [
  { id: 'u.daniel', name: 'Daniel', initials: 'D', colorSeed: 1 },
  { id: 'u.adel', name: 'Adel', initials: 'A', colorSeed: 2 },
  { id: 'u.priya', name: 'Priya', initials: 'P', colorSeed: 3 },
  { id: 'u.marcus', name: 'Marcus', initials: 'M', colorSeed: 4 },
  { id: 'u.wren', name: 'Wren', initials: 'W', colorSeed: 5 },
]

export const currentUser = users[0]

export function userById(id: string): User {
  return users.find((u) => u.id === id) ?? users[0]
}

export const spaces: Space[] = [
  {
    id: 'sp.eng',
    key: 'ENG',
    name: 'Engineering',
    icon: '🛠️',
    description: 'Architecture, runbooks, and the team handbook.',
    memberCount: 14,
    pageCount: 128,
    lastActivity: '3 hours ago',
    starred: true,
    archived: false,
    ownerId: 'u.daniel',
  },
  {
    id: 'sp.product',
    key: 'PROD',
    name: 'Product',
    icon: '🧭',
    description: 'Roadmaps, specs, and discovery notes.',
    memberCount: 9,
    pageCount: 64,
    lastActivity: 'Yesterday',
    starred: false,
    archived: false,
    ownerId: 'u.priya',
  },
  {
    id: 'sp.people',
    key: 'PEOPLE',
    name: 'People ops',
    icon: '🌱',
    description: 'Policies, onboarding, and benefits.',
    memberCount: 22,
    pageCount: 41,
    lastActivity: '4 days ago',
    starred: false,
    archived: false,
    ownerId: 'u.wren',
  },
  {
    id: 'sp.legacy',
    key: 'LEGACY',
    name: 'Legacy platform',
    icon: '📦',
    description: 'Retired service docs, kept for reference.',
    memberCount: 3,
    pageCount: 18,
    lastActivity: '2 months ago',
    starred: false,
    archived: true,
    ownerId: 'u.marcus',
  },
]

export const pageTree: Record<string, PageTreeNode[]> = {
  'sp.eng': [
    {
      id: 'pg.handbook',
      title: 'Handbook',
      icon: '📘',
      state: 'published',
      children: [
        { id: 'pg.onboarding', title: 'Onboarding', state: 'published', children: [] },
        {
          id: 'pg.architecture',
          title: 'Architecture',
          state: 'published',
          children: [
            { id: 'pg.adr-012', title: 'ADR-012 Queueing', state: 'published-unpublished-changes', children: [] },
            { id: 'pg.service-map', title: 'Service map', state: 'published', restricted: true, children: [] },
          ],
        },
      ],
    },
    {
      id: 'pg.runbooks',
      title: 'Runbooks',
      state: 'published',
      children: [
        { id: 'pg.incident-response', title: 'Incident response', state: 'published', children: [] },
        { id: 'pg.deploys', title: 'Deploys', state: 'draft', children: [] },
      ],
    },
    { id: 'pg.new-draft', title: 'Untitled', state: 'draft', children: [] },
  ],
  'sp.product': [
    {
      id: 'pg.roadmap',
      title: 'Roadmap',
      state: 'published',
      children: [
        { id: 'pg.q3-plan', title: 'Q3 plan', state: 'published', children: [] },
        { id: 'pg.q4-plan', title: 'Q4 plan', state: 'draft', children: [] },
      ],
    },
    { id: 'pg.discovery', title: 'Discovery notes', state: 'published', children: [] },
  ],
  'sp.people': [
    { id: 'pg.onboarding-people', title: 'New hire onboarding', state: 'published', children: [] },
    { id: 'pg.benefits', title: 'Benefits', state: 'published', restricted: true, children: [] },
  ],
  // Archived pages are hidden from the tree; they are listed in the space's archive view.
  'sp.legacy': [],
}

const adrComments: Comment[] = [
  {
    id: 'c1',
    authorId: 'u.adel',
    body: 'Should we also cover the retry policy for the dead-letter queue here, or is that a separate ADR?',
    relativeTime: '2 hours ago',
    anchorText: 'events are retried up to 5 times',
    replies: [
      {
        id: 'c1-r1',
        authorId: 'u.daniel',
        body: 'Separate ADR — I want to keep this one scoped to the transport choice.',
        relativeTime: '1 hour ago',
      },
    ],
  },
  {
    id: 'c2',
    authorId: 'u.priya',
    body: 'Nice writeup. Linked this from the Q3 plan.',
    relativeTime: '3 hours ago',
    resolved: true,
  },
]

const adrDraftHtml = `
      <p>We need a durable transport for payment lifecycle events between the ledger service and its
      nine downstream consumers. This record captures the decision and the reasoning behind it.</p>
      <h2 id="context">Context</h2>
      <p>Payment events currently fan out over synchronous HTTP calls made directly from the ledger
      service. At <mark class="mention">@Priya</mark>'s request we reviewed three incidents in the
      last quarter where a slow downstream consumer degraded checkout latency for every buyer.</p>
      <blockquote>The ledger service should never know how many consumers exist, or how fast they are.</blockquote>
      <h2 id="decision">Decision</h2>
      <p>We will introduce a managed queue in front of every consumer. Producers publish once;
      <code>events are retried up to 5 times</code> per consumer with exponential backoff before
      landing in a dead-letter queue.</p>
      <ul>
        <li>Ledger service publishes to a single topic per event type.</li>
        <li>Each consumer owns its own subscription and backlog.</li>
        <li>Ordering is guaranteed per payment id, not globally.</li>
      </ul>
      <h2 id="rollout">Rollout</h2>
      <ol>
        <li>Ship the queue in shadow mode alongside the existing HTTP fan-out.</li>
        <li>Compare delivery latency and error rate for two weeks.</li>
        <li>Cut over consumers one at a time, starting with the lowest-risk reporting service.</li>
      </ol>
      <h2 id="consequences">Consequences</h2>
      <p>Consumers must become idempotent, since at-least-once delivery means duplicate events are
      possible. <mark class="mention me">@Daniel</mark> will own the shared idempotency-key library.</p>
`

// Last published body: the draft above adds the consumer count change and the retry detail.
const adrPublishedHtml = adrDraftHtml
  .replace('its\n      nine downstream consumers', 'its\n      six downstream consumers')
  .replace(
    '<code>events are retried up to 5 times</code> per consumer with exponential backoff before\n      landing in a dead-letter queue.',
    'events are retried per consumer.',
  )

// Version 5 predates the Consequences section.
const adrV5Html = adrPublishedHtml.slice(0, adrPublishedHtml.indexOf('      <h2 id="consequences">'))

export const pages: Record<string, Page> = {
  'pg.adr-012': {
    id: 'pg.adr-012',
    spaceId: 'sp.eng',
    parentId: 'pg.architecture',
    title: 'ADR-012: Queueing strategy for payment events',
    icon: '📐',
    ownerId: 'u.daniel',
    updatedById: 'u.adel',
    updatedRelative: '3 hours ago',
    readTime: '6 min read',
    state: 'published-unpublished-changes',
    restricted: true,
    viewerIds: ['u.daniel', 'u.adel', 'u.priya'],
    starred: true,
    labels: [{ name: 'architecture' }, { name: 'payments' }, { name: 'decision-record' }],
    widthMode: 'reading',
    wordCount: 1180,
    comments: adrComments,
    versions: [
      { version: 6, authorId: 'u.adel', relativeTime: '3 hours ago', comment: 'Clarify retry semantics', current: true },
      { version: 5, authorId: 'u.daniel', relativeTime: '2 days ago', comment: 'Add rollout plan', contentHtml: adrV5Html },
      { version: 4, authorId: 'u.daniel', relativeTime: '1 week ago', comment: 'Initial decision recorded' },
    ],
    contentHtml: adrDraftHtml,
    publishedHtml: adrPublishedHtml,
  },
  'pg.onboarding': {
    id: 'pg.onboarding',
    spaceId: 'sp.eng',
    parentId: 'pg.handbook',
    title: 'Onboarding',
    icon: '👋',
    ownerId: 'u.wren',
    updatedById: 'u.wren',
    updatedRelative: '5 days ago',
    readTime: '4 min read',
    state: 'published',
    restricted: false,
    labels: [{ name: 'onboarding' }],
    widthMode: 'reading',
    wordCount: 640,
    comments: [],
    versions: [{ version: 2, authorId: 'u.wren', relativeTime: '5 days ago', comment: 'Update laptop request link', current: true }],
    contentHtml: `
      <p>Welcome to the team. This page collects everything you need for your first two weeks.</p>
      <h2 id="week-one">Week one</h2>
      <ul>
        <li>Get your laptop and accounts provisioned.</li>
        <li>Read the <a href="#">Architecture</a> overview.</li>
        <li>Pair with your onboarding buddy on a small fix.</li>
      </ul>
      <h2 id="week-two">Week two</h2>
      <p>Ship your first change to a runbook. Small documentation fixes are the fastest way to learn
      how review works here.</p>
    `,
  },
  'pg.handbook': {
    id: 'pg.handbook',
    spaceId: 'sp.eng',
    parentId: null,
    title: 'Handbook',
    icon: '📘',
    ownerId: 'u.daniel',
    updatedById: 'u.daniel',
    updatedRelative: '2 weeks ago',
    readTime: '2 min read',
    state: 'published',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 210,
    comments: [],
    versions: [{ version: 1, authorId: 'u.daniel', relativeTime: '2 weeks ago', comment: 'Initial page', current: true }],
    contentHtml: `
      <p>Everything about how the Engineering team works day to day lives under this page.</p>
      <h2 id="in-this-space">In this space</h2>
      <p>Start with Onboarding if you're new, then explore Architecture for how the system fits
      together, and Runbooks for how we operate it.</p>
    `,
  },
  'pg.architecture': {
    id: 'pg.architecture',
    spaceId: 'sp.eng',
    parentId: 'pg.handbook',
    title: 'Architecture',
    icon: '🏗️',
    ownerId: 'u.marcus',
    updatedById: 'u.marcus',
    updatedRelative: '1 month ago',
    readTime: '3 min read',
    state: 'published',
    restricted: false,
    labels: [{ name: 'architecture' }],
    widthMode: 'wide',
    wordCount: 420,
    comments: [],
    versions: [{ version: 3, authorId: 'u.marcus', relativeTime: '1 month ago', comment: 'Add service map link', current: true }],
    contentHtml: `
      <p>A map of how services talk to each other, and the decisions behind the shape of the system.</p>
      <h2 id="decision-records">Decision records</h2>
      <ul>
        <li>ADR-012: Queueing strategy for payment events</li>
      </ul>
    `,
  },
  'pg.service-map': {
    id: 'pg.service-map',
    spaceId: 'sp.eng',
    parentId: 'pg.architecture',
    title: 'Service map',
    ownerId: 'u.marcus',
    updatedById: 'u.marcus',
    updatedRelative: '6 weeks ago',
    readTime: '5 min read',
    state: 'published',
    restricted: true,
    labels: [{ name: 'architecture' }, { name: 'infra' }],
    widthMode: 'full',
    wordCount: 300,
    comments: [],
    versions: [{ version: 1, authorId: 'u.marcus', relativeTime: '6 weeks ago', comment: 'Initial page', current: true }],
    contentHtml: `<p>Restricted reference: production topology and on-call ownership per service.</p>`,
  },
  'pg.runbooks': {
    id: 'pg.runbooks',
    spaceId: 'sp.eng',
    parentId: null,
    title: 'Runbooks',
    ownerId: 'u.daniel',
    updatedById: 'u.daniel',
    updatedRelative: '2 months ago',
    readTime: '1 min read',
    state: 'published',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 90,
    comments: [],
    versions: [{ version: 1, authorId: 'u.daniel', relativeTime: '2 months ago', comment: 'Initial page', current: true }],
    contentHtml: `<p>Operational procedures for the services this team owns.</p>`,
  },
  'pg.incident-response': {
    id: 'pg.incident-response',
    spaceId: 'sp.eng',
    parentId: 'pg.runbooks',
    title: 'Incident response',
    ownerId: 'u.daniel',
    updatedById: 'u.marcus',
    updatedRelative: '2 weeks ago',
    readTime: '7 min read',
    state: 'published',
    restricted: false,
    labels: [{ name: 'oncall' }],
    widthMode: 'reading',
    wordCount: 980,
    comments: [],
    versions: [{ version: 4, authorId: 'u.marcus', relativeTime: '2 weeks ago', comment: 'Add rollback steps', current: true }],
    contentHtml: `
      <p>Follow this checklist when paged for a production incident.</p>
      <h2 id="severity">Severity</h2>
      <p>Declare severity within the first five minutes. When in doubt, declare higher and downgrade
      later.</p>
    `,
  },
  'pg.deploys': {
    id: 'pg.deploys',
    spaceId: 'sp.eng',
    parentId: 'pg.runbooks',
    title: 'Untitled',
    ownerId: 'u.daniel',
    updatedById: 'u.daniel',
    updatedRelative: '10 minutes ago',
    readTime: '1 min read',
    state: 'draft',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 40,
    comments: [],
    versions: [],
    contentHtml: `<p>Draft notes on the new deploy pipeline — not ready to share yet.</p>`,
  },
  'pg.new-draft': {
    id: 'pg.new-draft',
    spaceId: 'sp.eng',
    parentId: null,
    title: 'Untitled',
    ownerId: 'u.daniel',
    updatedById: 'u.daniel',
    updatedRelative: '2 minutes ago',
    readTime: '< 1 min read',
    state: 'draft',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 4,
    comments: [],
    versions: [],
    contentHtml: `<p></p>`,
  },
  'pg.roadmap': {
    id: 'pg.roadmap',
    spaceId: 'sp.product',
    parentId: null,
    title: 'Roadmap',
    ownerId: 'u.priya',
    updatedById: 'u.priya',
    updatedRelative: '1 day ago',
    readTime: '2 min read',
    state: 'published',
    restricted: false,
    starred: true,
    labels: [],
    widthMode: 'wide',
    wordCount: 300,
    comments: [],
    versions: [{ version: 2, authorId: 'u.priya', relativeTime: '1 day ago', comment: 'Refresh quarters', current: true }],
    contentHtml: `<p>What we're building, by quarter.</p>`,
  },
  'pg.q3-plan': {
    id: 'pg.q3-plan',
    spaceId: 'sp.product',
    parentId: 'pg.roadmap',
    title: 'Q3 plan',
    ownerId: 'u.priya',
    updatedById: 'u.priya',
    updatedRelative: '2 days ago',
    readTime: '4 min read',
    state: 'published',
    restricted: false,
    labels: [{ name: 'planning' }],
    widthMode: 'reading',
    wordCount: 540,
    comments: [],
    versions: [{ version: 1, authorId: 'u.priya', relativeTime: '2 days ago', comment: 'Initial page', current: true }],
    contentHtml: `<p>Q3 priorities across search, permissions, and the editor rewrite.</p>`,
  },
  'pg.q4-plan': {
    id: 'pg.q4-plan',
    spaceId: 'sp.product',
    parentId: 'pg.roadmap',
    title: 'Untitled',
    ownerId: 'u.priya',
    updatedById: 'u.priya',
    updatedRelative: '20 minutes ago',
    readTime: '1 min read',
    state: 'draft',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 60,
    comments: [],
    versions: [],
    contentHtml: `<p>Early notes, nothing solid yet.</p>`,
  },
  'pg.discovery': {
    id: 'pg.discovery',
    spaceId: 'sp.product',
    parentId: null,
    title: 'Discovery notes',
    ownerId: 'u.priya',
    updatedById: 'u.priya',
    updatedRelative: '4 days ago',
    readTime: '3 min read',
    state: 'published',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 410,
    comments: [],
    versions: [{ version: 1, authorId: 'u.priya', relativeTime: '4 days ago', comment: 'Initial page', current: true }],
    contentHtml: `<p>Interview notes from the last round of customer calls.</p>`,
  },
  'pg.onboarding-people': {
    id: 'pg.onboarding-people',
    spaceId: 'sp.people',
    parentId: null,
    title: 'New hire onboarding',
    ownerId: 'u.wren',
    updatedById: 'u.wren',
    updatedRelative: '1 week ago',
    readTime: '5 min read',
    state: 'published',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 700,
    comments: [],
    versions: [{ version: 1, authorId: 'u.wren', relativeTime: '1 week ago', comment: 'Initial page', current: true }],
    contentHtml: `<p>Paperwork, benefits enrollment, and your first week schedule.</p>`,
  },
  'pg.benefits': {
    id: 'pg.benefits',
    spaceId: 'sp.people',
    parentId: null,
    title: 'Benefits',
    ownerId: 'u.wren',
    updatedById: 'u.wren',
    updatedRelative: '3 weeks ago',
    readTime: '6 min read',
    state: 'published',
    restricted: true,
    viewerIds: ['u.wren', 'u.priya'],
    labels: [{ name: 'confidential' }],
    widthMode: 'reading',
    wordCount: 890,
    comments: [],
    versions: [{ version: 1, authorId: 'u.wren', relativeTime: '3 weeks ago', comment: 'Initial page', current: true }],
    contentHtml: `<p>Restricted: plan details and enrollment deadlines.</p>`,
  },
  'pg.old-api': {
    id: 'pg.old-api',
    spaceId: 'sp.legacy',
    parentId: null,
    title: 'Old API reference',
    ownerId: 'u.marcus',
    updatedById: 'u.marcus',
    updatedRelative: '2 months ago',
    readTime: '10 min read',
    state: 'archived',
    restricted: false,
    labels: [],
    widthMode: 'reading',
    wordCount: 1400,
    comments: [],
    versions: [{ version: 1, authorId: 'u.marcus', relativeTime: '2 months ago', comment: 'Initial page', current: true }],
    contentHtml: `<p>Kept for reference only. This service was decommissioned last quarter.</p>`,
  },
}

export function spaceById(id: string): Space | undefined {
  return spaces.find((s) => s.id === id)
}

export function pageById(id: string): Page | undefined {
  return pages[id]
}

export function findTreeNode(spaceId: string, pageId: string): PageTreeNode | undefined {
  function walk(nodes: PageTreeNode[]): PageTreeNode | undefined {
    for (const n of nodes) {
      if (n.id === pageId) return n
      const found = walk(n.children)
      if (found) return found
    }
    return undefined
  }
  return walk(pageTree[spaceId] ?? [])
}

export function ancestorChain(spaceId: string, pageId: string): PageTreeNode[] {
  const chain: PageTreeNode[] = []
  function walk(nodes: PageTreeNode[], trail: PageTreeNode[]): boolean {
    for (const n of nodes) {
      const nextTrail = [...trail, n]
      if (n.id === pageId) {
        chain.push(...nextTrail)
        return true
      }
      if (walk(n.children, nextTrail)) return true
    }
    return false
  }
  walk(pageTree[spaceId] ?? [], [])
  return chain
}

export const recentlyViewedSeed = [
  { pageId: 'pg.adr-012', spaceId: 'sp.eng', relativeTime: '2 minutes ago' },
  { pageId: 'pg.q3-plan', spaceId: 'sp.product', relativeTime: '1 hour ago' },
  { pageId: 'pg.incident-response', spaceId: 'sp.eng', relativeTime: 'Yesterday' },
  { pageId: 'pg.discovery', spaceId: 'sp.product', relativeTime: '2 days ago' },
]

export const followingFeed = [
  {
    pageId: 'pg.adr-012',
    spaceId: 'sp.eng',
    authorId: 'u.adel',
    relativeTime: '3 hours ago',
    summary: 'Clarified retry semantics for the dead-letter queue and linked the idempotency library.',
  },
  {
    pageId: 'pg.q3-plan',
    spaceId: 'sp.product',
    authorId: 'u.priya',
    relativeTime: '2 days ago',
    summary: 'Reordered priorities to put the editor rewrite ahead of search.',
  },
]

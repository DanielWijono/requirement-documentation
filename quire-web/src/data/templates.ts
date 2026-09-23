export interface PageTemplate {
  id: string
  name: string
  description: string
  category: 'Recent' | 'Meetings' | 'Product' | 'People'
  /** Title given to the new page; blank pages stay "Untitled". */
  title: string
  html: string
}

export const TEMPLATES: PageTemplate[] = [
  {
    id: 'blank',
    name: 'Blank page',
    description: 'Start with an empty canvas.',
    category: 'Recent',
    title: 'Untitled',
    html: '<p></p>',
  },
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    description: 'Agenda, attendees, and action items.',
    category: 'Meetings',
    title: 'Meeting notes',
    html: [
      '<h2>Attendees</h2><ul><li><p></p></li></ul>',
      '<h2>Agenda</h2><ol><li><p></p></li></ol>',
      '<h2>Notes</h2><p></p>',
      '<h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>',
    ].join(''),
  },
  {
    id: 'prd',
    name: 'Product requirements',
    description: 'Problem, goals, scope, and success metrics.',
    category: 'Product',
    title: 'Product requirements',
    html: [
      '<h2>Problem</h2><p></p>',
      '<h2>Goals</h2><ul><li><p></p></li></ul>',
      '<h2>Scope</h2><p>In scope:</p><ul><li><p></p></li></ul><p>Out of scope:</p><ul><li><p></p></li></ul>',
      '<h2>Success metrics</h2><ul><li><p></p></li></ul>',
    ].join(''),
  },
  {
    id: 'retro',
    name: 'Retrospective',
    description: 'What went well, what didn’t, action items.',
    category: 'Meetings',
    title: 'Retrospective',
    html: [
      '<h2>What went well</h2><ul><li><p></p></li></ul>',
      '<h2>What didn’t</h2><ul><li><p></p></li></ul>',
      '<h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>',
    ].join(''),
  },
]

/** Headings of a template body, used for previews. */
export function templateOutline(t: PageTemplate): string[] {
  return [...t.html.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1])
}

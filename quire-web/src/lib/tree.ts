import type { PageTreeNode } from '../types'

export function findTreeNodeIn(nodes: PageTreeNode[], pageId: string): PageTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === pageId) return n
    const found = findTreeNodeIn(n.children, pageId)
    if (found) return found
  }
  return undefined
}

/** The nodes from the top of the tree down to `pageId`, inclusive; empty when it isn't there. */
export function ancestorChainIn(nodes: PageTreeNode[], pageId: string): PageTreeNode[] {
  for (const n of nodes) {
    if (n.id === pageId) return [n]
    const below = ancestorChainIn(n.children, pageId)
    if (below.length) return [n, ...below]
  }
  return []
}

export function countNodes(nodes: PageTreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0)
}

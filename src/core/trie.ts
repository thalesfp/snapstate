import type { Listener, Unsubscribe } from "./types.js";

function invokeAll(listeners: Set<Listener>): void {
  let firstError: unknown;
  for (const l of listeners) {
    try { l(); } catch (e) { firstError ??= e; }
  }
  if (firstError !== undefined) { throw firstError; }
}

interface TrieNode {
  listeners: Set<Listener>;
  children: Map<string, TrieNode>;
}

function createNode(): TrieNode {
  return { listeners: new Set(), children: new Map() };
}

function parsePath(path: string): string[] {
  if (path === "") { return []; }
  return path.split(".");
}

export class SubscriptionTrie {
  private root = createNode();
  private globalListeners = new Set<Listener>();

  /** Subscribe to a specific path. Returns unsubscribe function. */
  add(path: string, listener: Listener): Unsubscribe {
    const segments = parsePath(path);
    const parents: { parent: TrieNode; segment: string }[] = [];
    let node = this.root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, createNode());
      }
      parents.push({ parent: node, segment: seg });
      node = node.children.get(seg)!;
    }
    node.listeners.add(listener);
    return () => {
      node.listeners.delete(listener);
      for (let i = parents.length - 1; i >= 0; i--) {
        const { parent, segment } = parents[i];
        const child = parent.children.get(segment)!;
        if (child.listeners.size === 0 && child.children.size === 0) {
          parent.children.delete(segment);
        } else {
          break;
        }
      }
    };
  }

  /** Subscribe to all changes (no path filter). */
  addGlobal(listener: Listener): Unsubscribe {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /** Notify listeners for exact path, all ancestors, and all descendants. */
  notify(path: string): void {
    const segments = parsePath(path);
    const collected = new Set<Listener>();

    // Collect global listeners
    for (const l of this.globalListeners) collected.add(l);

    // Walk down to the target, collecting ancestor listeners
    let node = this.root;
    // Root-level listeners (subscribe to "")
    for (const l of node.listeners) collected.add(l);

    let matched = true;
    for (const seg of segments) {
      // Check wildcard sibling at this level
      const wildcard = node.children.get("*");
      if (wildcard) {
        for (const l of wildcard.listeners) collected.add(l);
        this.collectDescendants(wildcard, collected);
      }

      const child = node.children.get(seg);
      if (!child) {
        matched = false;
        break;
      }
      node = child;
      for (const l of node.listeners) collected.add(l);
    }

    // Only collect descendants if we matched the full path
    if (matched) {
      this.collectDescendants(node, collected);
    }

    invokeAll(collected);
  }

  /** Notify all listeners in the trie. */
  notifyAll(): void {
    const collected = new Set<Listener>();
    for (const l of this.globalListeners) collected.add(l);
    this.collectDescendants(this.root, collected);
    for (const l of this.root.listeners) collected.add(l);
    invokeAll(collected);
  }

  private collectDescendants(node: TrieNode, out: Set<Listener>): void {
    for (const child of node.children.values()) {
      for (const l of child.listeners) out.add(l);
      this.collectDescendants(child, out);
    }
  }

  clear(): void {
    this.root = createNode();
    this.globalListeners.clear();
  }
}

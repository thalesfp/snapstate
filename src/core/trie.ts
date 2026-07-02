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
    this.notifyPaths([path]);
  }

  /** Notify listeners for several changed paths at once; each listener fires at most once. */
  notifyPaths(paths: string[]): void {
    if (paths.length === 0) { return; }

    const collected = new Set<Listener>();
    for (const l of this.globalListeners) collected.add(l);
    // Root-level listeners (subscribe to "")
    for (const l of this.root.listeners) collected.add(l);

    for (const path of paths) {
      this.collectPath(path, collected);
    }
    invokeAll(collected);
  }

  private collectPath(path: string, out: Set<Listener>): void {
    // Parallel walk: a "*" child matches exactly one segment, so both the
    // exact child and the wildcard child keep matching the remaining path.
    const segments = parsePath(path);
    let frontier: TrieNode[] = [this.root];
    let matchedAll = true;
    for (const seg of segments) {
      const next: TrieNode[] = [];
      for (const node of frontier) {
        const exact = node.children.get(seg);
        if (exact) { next.push(exact); }
        const wildcard = node.children.get("*");
        if (wildcard && wildcard !== exact) { next.push(wildcard); }
      }
      for (const node of next) {
        for (const l of node.listeners) out.add(l);
      }
      if (next.length === 0) {
        matchedAll = false;
        break;
      }
      frontier = next;
    }

    // Only collect descendants if we matched the full path
    if (matchedAll) {
      for (const node of frontier) {
        this.collectDescendants(node, out);
      }
    }
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

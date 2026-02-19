import { describe, it, expect, vi } from "vitest";
import { SubscriptionTrie } from "../src/core/trie.js";

describe("SubscriptionTrie", () => {
  it("notifies exact path listeners", () => {
    const trie = new SubscriptionTrie();
    const listener = vi.fn();
    trie.add("user.name", listener);

    trie.notify("user.name");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies ancestor listeners", () => {
    const trie = new SubscriptionTrie();
    const rootListener = vi.fn();
    const parentListener = vi.fn();
    trie.add("", rootListener);
    trie.add("user", parentListener);

    trie.notify("user.name");
    expect(rootListener).toHaveBeenCalledTimes(1);
    expect(parentListener).toHaveBeenCalledTimes(1);
  });

  it("notifies descendant listeners", () => {
    const trie = new SubscriptionTrie();
    const childListener = vi.fn();
    trie.add("user.name.first", childListener);

    trie.notify("user");
    expect(childListener).toHaveBeenCalledTimes(1);
  });

  it("does not notify unrelated paths", () => {
    const trie = new SubscriptionTrie();
    const listener = vi.fn();
    trie.add("settings.theme", listener);

    trie.notify("user.name");
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports wildcard subscriptions", () => {
    const trie = new SubscriptionTrie();
    const listener = vi.fn();
    trie.add("user.*", listener);

    trie.notify("user.name");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes correctly", () => {
    const trie = new SubscriptionTrie();
    const listener = vi.fn();
    const unsub = trie.add("user.name", listener);

    unsub();
    trie.notify("user.name");
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies global listeners on any path", () => {
    const trie = new SubscriptionTrie();
    const listener = vi.fn();
    trie.addGlobal(listener);

    trie.notify("user.name");
    expect(listener).toHaveBeenCalledTimes(1);

    trie.notify("settings.theme");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("notifyAll fires every listener", () => {
    const trie = new SubscriptionTrie();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    trie.add("x", a);
    trie.add("y.z", b);
    trie.addGlobal(c);

    trie.notifyAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("deduplicates listeners across ancestor/descendant", () => {
    const trie = new SubscriptionTrie();
    const listener = vi.fn();
    // Same listener on both parent and child
    trie.add("user", listener);
    trie.add("user.name", listener);

    trie.notify("user.name");
    // Should only fire once because Set deduplication
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clear removes all listeners", () => {
    const trie = new SubscriptionTrie();
    const a = vi.fn();
    const b = vi.fn();
    trie.add("x", a);
    trie.addGlobal(b);

    trie.clear();
    trie.notify("x");
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  describe("error isolation", () => {
    it("calls all listeners even when one throws (notify)", () => {
      const trie = new SubscriptionTrie();
      const a = vi.fn();
      const b = vi.fn(() => { throw new Error("boom"); });
      const c = vi.fn();
      trie.add("x", a);
      trie.add("x", b);
      trie.add("x", c);

      expect(() => trie.notify("x")).toThrow("boom");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(c).toHaveBeenCalledTimes(1);
    });

    it("calls all listeners even when one throws (notifyAll)", () => {
      const trie = new SubscriptionTrie();
      const a = vi.fn();
      const b = vi.fn(() => { throw new Error("boom"); });
      const c = vi.fn();
      trie.add("x", a);
      trie.add("y", b);
      trie.addGlobal(c);

      expect(() => trie.notifyAll()).toThrow("boom");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(c).toHaveBeenCalledTimes(1);
    });
  });

  describe("trie pruning on unsubscribe", () => {
    it("removes empty branch after unsubscribe", () => {
      const trie = new SubscriptionTrie();
      const unsub = trie.add("a.b.c", vi.fn());
      unsub();

      // Root should have no 'a' child
      expect((trie as any).root.children.has("a")).toBe(false);
    });

    it("prunes leaf but keeps sibling path", () => {
      const trie = new SubscriptionTrie();
      const unsub1 = trie.add("a.b.c", vi.fn());
      trie.add("a.b", vi.fn());

      unsub1();

      // a.b still has a listener, so 'a' and 'a.b' remain
      const aNode = (trie as any).root.children.get("a");
      expect(aNode).toBeDefined();
      expect(aNode.children.get("b")).toBeDefined();
      // but 'c' is pruned
      expect(aNode.children.get("b").children.has("c")).toBe(false);
    });

    it("keeps node that still has children", () => {
      const trie = new SubscriptionTrie();
      const unsub1 = trie.add("a.b", vi.fn());
      trie.add("a.b.c", vi.fn());

      unsub1();

      // a.b still has child 'c', so the branch remains
      const aNode = (trie as any).root.children.get("a");
      expect(aNode).toBeDefined();
      expect(aNode.children.get("b")).toBeDefined();
      expect(aNode.children.get("b").children.has("c")).toBe(true);
    });
  });
});

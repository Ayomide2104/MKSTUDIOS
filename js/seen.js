/* Seen-post tracking. A post counts as seen only after it has been mostly on
   screen for a moment (not just loaded into the page). Seen posts are sent to
   the server in small batches; the feed then ranks them lower. */
export function createSeenTracker({ api, isSignedIn }) {
  const queue = new Set();
  const sent = new Set();
  const timers = new Map();
  let flushTimer = null;

  async function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    const ids = [...queue].filter((id) => !sent.has(id)).slice(0, 50);
    queue.clear();
    if (!ids.length || !isSignedIn()) return;
    ids.forEach((id) => sent.add(id));
    try {
      await api('/posts/seen', { method: 'POST', body: JSON.stringify({ ids }) });
    } catch {
      ids.forEach((id) => sent.delete(id));
    }
  }

  function schedule() {
    if (!flushTimer) flushTimer = setTimeout(flush, 4000);
  }

  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const id = entry.target.dataset.postId;
          if (!id) continue;
          const mostlyVisible = entry.isIntersecting && (
            entry.intersectionRatio >= 0.6 ||
            entry.intersectionRect.height >= window.innerHeight * 0.5
          );
          if (mostlyVisible) {
            if (!timers.has(id) && !sent.has(id)) {
              timers.set(id, setTimeout(() => {
                timers.delete(id);
                queue.add(id);
                schedule();
              }, 1200));
            }
          } else if (timers.has(id)) {
            clearTimeout(timers.get(id));
            timers.delete(id);
          }
        }
      }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] })
    : null;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  return {
    observe(node) { if (observer && isSignedIn() && node?.dataset?.postId) observer.observe(node); },
    flush,
  };
}

import { timelineForActiveWorld } from '../memory/timeline';
import { compactText, escapeHtml } from '../core/utils';
import { formatConversationTime } from './display-labels';

export type WorldWorkbenchPanelContext = {
  timelineNoteDraft: string;
  renderTimeline: () => string;
};

export function renderWorldDrawerTimeline(context: WorldWorkbenchPanelContext): string {
  const entries = timelineForActiveWorld();
  const recentEntries = entries.slice(0, 3);
  return `
    <section class="world-drawer-section world-memory-section">
      <h3>最近记忆</h3>
      <div class="world-memory-mini">
        ${recentEntries.length > 0
          ? recentEntries.map(entry => `<span><small>${escapeHtml(formatConversationTime(entry.createdAt))}</small>${escapeHtml(compactText(entry.summary || entry.title, 72))}</span>`).join('')
          : '<span><small>暂无</small>还没有世界记忆。</span>'}
      </div>
      <form class="timeline-note-form" id="timeline-note-form">
        <label class="field">
          <span>手动记录</span>
          <textarea id="timeline-note-input" placeholder="记下一件这个世界应该记住的日常小事…">${escapeHtml(context.timelineNoteDraft)}</textarea>
        </label>
        <footer>
          <p class="muted">保存后会进入当前世界的长期记忆。</p>
          <button class="primary" type="submit">保存记忆</button>
        </footer>
      </form>
      <details class="world-drawer-details">
        <summary>完整时间线 · ${entries.length} 条</summary>
        <div class="timeline-feed world-drawer-timeline-feed">${context.renderTimeline()}</div>
      </details>
    </section>
  `;
}

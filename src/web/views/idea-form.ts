import { escapeHtml } from './layout.js';

export function renderIdeaForm(): string {
  return `<form class="idea-form card" action="/api/ideas" method="post">
    <label>
      <span>Micro-business idea</span>
      <textarea name="idea" rows="5" required placeholder="Example: automatic app that saves parking location when Bluetooth disconnects"></textarea>
    </label>
    <div class="form-grid">
      <label>
        <span>Target market</span>
        <input name="targetMarket" type="text" placeholder="drivers, parents, solo founders">
      </label>
      <label>
        <span>Expected price</span>
        <input name="expectedPrice" type="text" placeholder="$19 one-time">
      </label>
      <label>
        <span>Platform</span>
        <input name="platform" type="text" placeholder="iPhone, Android, web">
      </label>
    </div>
    <button class="primary-button" type="submit">Create validation job</button>
  </form>`;
}

export function renderFormError(message: string): string {
  return `<div class="notice notice-error" role="alert">${escapeHtml(message)}</div>`;
}

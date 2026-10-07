// Test fixture: a web component with an open shadow root, and a fixed button that counts its clicks.
customElements.define('stat-card', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    const style = new CSSStyleSheet();
    style.replaceSync(':host{display:block}.card{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(33,29,58,.06),0 8px 24px rgba(33,29,58,.06)}.label{font-size:13px;color:#6b6688}.value{font-size:30px;font-weight:800;color:#211d3a}.badge{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:99px;background:#e9e6ff;color:#4b3fd1;font-size:12px}');
    root.adoptedStyleSheets = [style];
    const card = document.createElement('div');
    card.className = 'card';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = this.getAttribute('label');
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = this.getAttribute('value');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'this week';
    card.append(label, value, badge);
    root.append(card);
  }
});
document.getElementById('help').addEventListener('click', () => {
  const c = document.getElementById('clicks');
  c.textContent = String(+c.textContent + 1);
});
for (const f of document.querySelectorAll('form')) f.addEventListener('submit', (e) => e.preventDefault());

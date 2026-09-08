// toast.js

let hideTimer = null;

export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

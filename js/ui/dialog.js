// dialog.js — confirm/alert dialog & bottom sheet, setara AppDialog di Flutter.

export function confirmDialog({ title, message, confirmLabel = 'Ya, Lanjutkan', cancelLabel = 'Batal', dangerous = false }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `
      <div class="dialog">
        <div class="dialog-title">${title}</div>
        <div class="dialog-message">${message}</div>
        <div class="dialog-actions">
          <button class="cancel">${cancelLabel}</button>
          <button class="confirm ${dangerous ? 'dangerous' : ''}">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const cleanup = (result) => { document.body.removeChild(backdrop); resolve(result); };
    backdrop.querySelector('.cancel').onclick = () => cleanup(false);
    backdrop.querySelector('.confirm').onclick = () => cleanup(true);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
  });
}

export function alertDialog({ title, message, okLabel = 'OK' }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `
      <div class="dialog">
        <div class="dialog-title">${title}</div>
        <div class="dialog-message">${message}</div>
        <div class="dialog-actions"><button class="confirm">${okLabel}</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = () => { document.body.removeChild(backdrop); resolve(); };
    backdrop.querySelector('.confirm').onclick = close;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  });
}

/**
 * Bottom sheet generik. `renderContent(container, close)` mengisi `container`
 * dengan HTML/listener; panggil `close(result)` dari dalamnya untuk menutup.
 */
export function openSheet(renderContent) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = '<div class="sheet-handle"></div>';
    const body = document.createElement('div');
    body.className = 'sheet-body';
    sheet.appendChild(body);
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);

    const close = (result) => {
      if (!document.body.contains(backdrop)) return;
      document.body.removeChild(backdrop);
      resolve(result);
    };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(undefined); });
    renderContent(body, close);
  });
}

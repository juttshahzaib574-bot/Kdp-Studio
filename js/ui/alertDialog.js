// Module: Alert Dialog — a generic, reusable "here's what went wrong" popup, the kind
// of clear inline feedback professional platforms show instead of silently failing or
// leaving a user to guess. Used by the Asset Gallery for unsupported-format / too-large
// / storage-full uploads; kept generic so any other panel can reuse it.

const el = {
  dialog: document.getElementById("alert-dialog"),
  title: document.getElementById("alert-dialog-title"),
  message: document.getElementById("alert-dialog-message"),
  okBtn: document.getElementById("alert-dialog-ok-btn"),
};

let initialized = false;

function ensureInit() {
  if (initialized) return;
  initialized = true;
  el.okBtn.addEventListener("click", () => el.dialog.close());
  el.dialog.addEventListener("click", (e) => {
    // Click on the backdrop (the dialog element itself, outside its content box) closes it.
    if (e.target === el.dialog) el.dialog.close();
  });
}

export function showAlert({ title = "⚠️ Something Went Wrong", message }) {
  ensureInit();
  el.title.textContent = title;
  el.message.textContent = message;
  if (!el.dialog.open) el.dialog.showModal();
}

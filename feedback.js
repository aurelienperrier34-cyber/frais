const feedbackForm = document.querySelector('#feedback-form');
const feedbackStatus = document.querySelector('#feedback-status');
feedbackForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const image = document.querySelector('#feedback-image').files[0];
  if (!image) return;
  const body = new FormData();
  body.append('image', image);
  body.append('note', document.querySelector('#feedback-note').value);
  feedbackStatus.textContent = 'Envoi de la capture…';
  try {
    const response = await fetch('/feedback', { method: 'POST', body });
    if (!response.ok) throw new Error('envoi impossible');
    feedbackStatus.textContent = 'Capture reçue sur l’ordinateur. Merci !';
    feedbackForm.reset();
  } catch {
    feedbackStatus.textContent = 'Envoi impossible. Vérifie que tu utilises bien le lien mobile en Wi‑Fi.';
  }
});

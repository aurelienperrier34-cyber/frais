// L’interface ne crée aucune estimation : les chiffres viennent uniquement de live-map.js.
const options = document.querySelectorAll('.route-option');
const insight = document.querySelector('#insight p');

options.forEach(option => option.addEventListener('click', () => {
  options.forEach(item => item.classList.toggle('active', item === option));
  if (insight) insight.textContent = 'Le calcul précis d’ombre et de fraîcheur sera affiché ici une fois les données solaires et LiDAR analysées.';
}));

document.querySelector('#update-app')?.addEventListener('click', () => location.href = './refresh.html');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem('frais-sw-reloaded')) return;
    sessionStorage.setItem('frais-sw-reloaded', 'true');
    window.location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js?v=47'));
}

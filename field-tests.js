const testKey = 'frais-prades-field-tests';
const form = document.querySelector('#field-form');
const testList = document.querySelector('#test-list');
const testCount = document.querySelector('#test-count');
const exportButton = document.querySelector('#export-tests');
const readTests = () => JSON.parse(localStorage.getItem(testKey) || '[]');

document.querySelectorAll('.test-route').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#from').value = button.dataset.from;
  document.querySelector('#to').value = button.dataset.to;
  document.querySelector('#search').click();
  document.querySelector('.planner').scrollIntoView({ behavior: 'smooth', block: 'center' });
}));

function renderTests() {
  const tests = readTests();
  testCount.textContent = `${tests.length} / 6 tests`;
  exportButton.hidden = tests.length === 0;
  testList.innerHTML = tests.slice().reverse().map((test, index) => `<div class="test-entry"><b>Test ${tests.length - index}</b> · ${test.time} · ombre : ${test.shade}${test.water ? ' · eau trouvée' : ''}${test.access ? ' · passage difficile' : ''}${test.note ? `<br>${test.note}` : ''}</div>`).join('');
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const tests = readTests();
  tests.push({ time: document.querySelector('#test-time').value, shade: document.querySelector('#test-shade').value, water: document.querySelector('#test-water').checked, access: document.querySelector('#test-access').checked, note: document.querySelector('#test-note').value.trim(), savedAt: new Date().toISOString() });
  localStorage.setItem(testKey, JSON.stringify(tests));
  form.reset();
  renderTests();
});

exportButton.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(readTests(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = 'observations-frais-prades.json'; link.click(); URL.revokeObjectURL(link.href);
});

renderTests();

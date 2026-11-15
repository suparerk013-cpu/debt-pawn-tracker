// Phase 0: just check that the browser can run what later phases need.

const checks = [
  ['ES modules', true], // if this line runs, modules work
  ['Web Audio (AudioContext)', 'AudioContext' in window || 'webkitAudioContext' in window],
  ['Secure context (localhost/https)', window.isSecureContext],
  ['AudioWorklet', typeof AudioWorkletNode !== 'undefined'],
  ['IndexedDB', 'indexedDB' in window],
];

const list = document.getElementById('checks');
for (const [name, ok] of checks) {
  const li = document.createElement('li');
  li.innerHTML = `<span></span><span class="${ok ? 'ok' : 'fail'}">${ok ? 'OK' : 'NO'}</span>`;
  li.firstChild.textContent = name;
  list.appendChild(li);
}

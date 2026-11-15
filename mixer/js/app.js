const el = document.getElementById('audio');
const Ctx = window.AudioContext || window.webkitAudioContext;
const ok = Ctx && window.isSecureContext && 'audioWorklet' in Ctx.prototype;
el.textContent = ok ? 'Web Audio + AudioWorklet: OK' : 'Web Audio/AudioWorklet: ไม่พร้อม';

/* Decoración RX5day / umbral; no simulación diaria. */
export function animarLluvia(root) {
  for (const canvas of root.querySelectorAll('.lluvia-canvas')) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const ratio = Number(canvas.dataset.lluvia);
    if (!ratio) continue;
    canvas.width = 640; canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    let frame = 0, visible = false, start = 0;
    function stop() { cancelAnimationFrame(frame); frame = 0; }
    function draw(t) {
      frame = 0;
      if (!canvas.isConnected) { cleanup(); return; }
      if (!visible || document.hidden || reduced.matches) return;
      if (!start) start = t;
      ctx.clearRect(0, 0, 640, 400);
      ctx.strokeStyle = 'rgba(144,195,218,.65)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < Math.round(ratio * 28); i++) {
        const x = 300 + (i * 47) % 320, y = (i * 53 + (t - start) * .075) % 290;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 18); ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    }
    function sync() {
      if (!canvas.isConnected) { cleanup(); return; }
      stop(); ctx.clearRect(0, 0, 640, 400);
      if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
    }
    function cleanup() {
      stop(); observer.disconnect(); removal.disconnect();
      document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
    }
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
    const removal = new MutationObserver(() => { if (!canvas.isConnected) cleanup(); });
    observer.observe(canvas); removal.observe(root, {childList: true, subtree: true});
    document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
  }
}

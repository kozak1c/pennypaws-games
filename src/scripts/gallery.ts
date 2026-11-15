// A gallery on phones and tablets: one picture at a time, whole, with a row of small pictures under
// it that shows how many there are and which one is showing. Tapping a small picture brings it up;
// swiping the big one works too. On desktop every picture is in view and the row is hidden by CSS.
// Without JavaScript the big pictures still swipe one at a time and the row stays hidden.
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll<HTMLElement>('[data-gallery]').forEach((gallery) => {
  const stage = gallery.querySelector<HTMLElement>('[data-gallery-stage]');
  const bar = gallery.querySelector<HTMLElement>('[data-gallery-thumbs]');
  if (!stage || !bar) return;
  const items = Array.from(stage.children) as HTMLElement[];
  const thumbs = Array.from(bar.querySelectorAll<HTMLButtonElement>('button'));
  if (items.length !== thumbs.length || items.length < 2) return;

  const show = (index: number) => {
    thumbs.forEach((thumb, i) => thumb.setAttribute('aria-current', String(i === index)));
  };

  thumbs.forEach((thumb, i) => {
    thumb.addEventListener('click', () => {
      const item = items[i];
      const left = item.offsetLeft - (stage.clientWidth - item.offsetWidth) / 2;
      stage.scrollTo({ left, behavior: calm.matches ? 'auto' : 'smooth' });
      show(i);
    });
  });

  // The picture nearest the middle of the stage is the one showing. The stage is positioned, so each
  // picture's offsetLeft is measured from the stage's own left edge.
  let frame = 0;
  stage.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const middle = stage.scrollLeft + stage.clientWidth / 2;
        let best = 0;
        let distance = Infinity;
        items.forEach((item, i) => {
          const d = Math.abs(item.offsetLeft + item.offsetWidth / 2 - middle);
          if (d < distance) {
            distance = d;
            best = i;
          }
        });
        show(best);
      });
    },
    { passive: true },
  );

  show(0);
  bar.hidden = false;
});

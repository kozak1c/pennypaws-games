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

  // The picture nearest the middle of the stage is the one showing. The stage is positioned, so each
  // picture's offsetLeft is measured from the stage's own left edge.
  const nearest = () => {
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
    return best;
  };

  // After a tap the stage glides past the pictures in between. The tapped one stays marked the whole
  // way, so the ring does not hop along the row; it follows the stage again once the scroll stops.
  let chosen: number | null = null;
  let settle = 0;
  const release = () => {
    chosen = null;
    show(nearest());
  };

  thumbs.forEach((thumb, i) => {
    thumb.addEventListener('click', () => {
      const item = items[i];
      chosen = i;
      show(i);
      const left = item.offsetLeft - (stage.clientWidth - item.offsetWidth) / 2;
      if (Math.abs(stage.scrollLeft - left) < 1) {
        release();
        return;
      }
      stage.scrollTo({ left, behavior: calm.matches ? 'auto' : 'smooth' });
      clearTimeout(settle);
      settle = window.setTimeout(release, 900); // in case the browser never reports the end
    });
  });

  let frame = 0;
  stage.addEventListener(
    'scroll',
    () => {
      if (chosen !== null) {
        // Still gliding to the tapped picture: wait for the scroll to go quiet.
        clearTimeout(settle);
        settle = window.setTimeout(release, 140);
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => show(nearest()));
    },
    { passive: true },
  );
  stage.addEventListener('scrollend', () => {
    if (chosen !== null) {
      clearTimeout(settle);
      release();
    }
  });

  show(0);
  bar.hidden = false;
});

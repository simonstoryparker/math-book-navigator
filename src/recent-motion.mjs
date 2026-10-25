// Material 3 Expressive adaptation: 15% expansion, fast spatial spring
// (damping ratio .9, stiffness 1400). FLIP animates transforms rather than grid
// widths; inverse child scaling keeps the labels readable while neighbors move.
export function setupRecentMotion(group) {
  const links = [...group.children],
    animations = new Map();
  const fine = matchMedia('(hover:hover) and (pointer:fine)'),
    reduce = matchMedia('(prefers-reduced-motion:reduce)');
  const weights = links.map((link) => Number(link.dataset.weight) || 1);
  let current = -1;
  const ease = (time) => {
    const omega = Math.sqrt(1400),
      damping = 0.9,
      frequency = omega * Math.sqrt(1 - damping * damping);
    return (
      1 -
      Math.exp(-damping * omega * time) *
        (Math.cos(frequency * time) +
          ((damping * omega) / frequency) * Math.sin(frequency * time))
    );
  };
  function set(index, animate = true) {
    if (current === index) return;
    const before = links.map((link) => link.getBoundingClientRect());
    animations.forEach((animation) => animation.cancel());
    animations.clear();
    current = index;
    group.style.gridTemplateColumns = weights
      .map((weight, i) => `${weight * (i === index ? 1.15 : 1)}fr`)
      .join(' ');
    links.forEach((link, i) =>
      link.toggleAttribute('data-emphasis', i === index),
    );
    if (
      !animate ||
      reduce.matches ||
      document.documentElement.hasAttribute('data-keyboard')
    )
      return;
    links.forEach((link, i) => {
      const after = link.getBoundingClientRect();
      if (!after.width) return;
      const frames = [],
        inner = [];
      for (let step = 0; step <= 28; step++) {
        const progress = step === 28 ? 1 : ease(step / 100),
          scale = 1 + (before[i].width / after.width - 1) * (1 - progress);
        frames.push({
          transform: `translateX(${(before[i].left - after.left) * (1 - progress)}px) scaleX(${scale})`,
          offset: step / 28,
        });
        inner.push({ transform: `scaleX(${1 / scale})`, offset: step / 28 });
      }
      animations.set(
        link,
        link.animate(frames, { duration: 280, easing: 'linear' }),
      );
      const content = link.firstElementChild;
      animations.set(
        content,
        content.animate(inner, { duration: 280, easing: 'linear' }),
      );
    });
  }
  const enter = (event) => {
    if (fine.matches && !reduce.matches)
      set(links.indexOf(event.currentTarget));
  };
  const leave = () => set(-1);
  for (const link of links) link.addEventListener('pointerenter', enter);
  group.addEventListener('pointerleave', leave);
  const reset = () => {
    animations.forEach((animation) => animation.cancel());
    animations.clear();
    current = -2;
    set(-1, false);
  };
  addEventListener('resize', reset);
  reduce.addEventListener('change', reset);
  group.style.gridTemplateColumns = weights
    .map((weight) => `${weight}fr`)
    .join(' ');
  return () => {
    animations.forEach((animation) => animation.cancel());
    for (const link of links) link.removeEventListener('pointerenter', enter);
    group.removeEventListener('pointerleave', leave);
    removeEventListener('resize', reset);
    reduce.removeEventListener('change', reset);
  };
}

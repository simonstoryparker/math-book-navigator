// Preserve section contents; never split at individual question anchors.
export function continuousCrops(section) {
  return section.units.flatMap((unit) => {
    if (
      unit.order < section.start.unitOrder ||
      unit.order > section.end.unitOrder
    )
      return [];
    const y = Math.max(
      0,
      unit.order === section.start.unitOrder
        ? section.start.top - 18
        : unit.top,
    );
    const bottom = Math.min(
      unit.analysis.height,
      unit.order === section.end.unitOrder ? section.end.top : unit.bottom,
    );
    if (bottom <= y) return [];
    return [
      {
        pageNumber: unit.pageNumber,
        unitOrder: unit.order,
        x: unit.x,
        y,
        width: unit.width,
        height: bottom - y,
        exact: true,
      },
    ];
  });
}

// Bounds of every non-white pixel, with a small safety margin for antialiasing.
export function blankSideBounds(data, width, height, padding = 8) {
  let left = width,
    right = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        data[i + 3] > 0 &&
        Math.min(data[i], data[i + 1], data[i + 2]) < 245
      ) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  if (right < left) return { left: 0, width };
  left = Math.max(0, left - padding);
  right = Math.min(width - 1, right + padding);
  return { left, width: right - left + 1 };
}

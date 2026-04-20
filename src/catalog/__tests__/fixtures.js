/**
 * Synthetic catalog fixtures (SMA-123).
 *
 * `make869()` mirrors the Squarespace reference tenant inspected in
 * SMA-122. `make8k()` pushes the catalog past `LOCAL_TIER_MAX_PARENTS` so
 * tier routing selects `byok`. Both generators return catalog stats in the
 * same shape the Squarespace and Shopify fetchers report via `onStats`.
 */

function makeProduct(i) {
  return {
    id: `p${i}`,
    name: `Product ${i}`,
    desc: `Desc for product ${i}`,
    price: (i % 20) + 1,
    stock: 99,
    category: 'Product',
  }
}

function build(parentCount, variantRatio = 1) {
  const products = []
  const variantCount = parentCount * variantRatio
  for (let i = 0; i < variantCount; i++) products.push(makeProduct(i))
  return {
    products,
    stats: { parentCount, variantCount },
  }
}

export function make869() {
  return build(869)
}

export function make8k() {
  return build(8000)
}

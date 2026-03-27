/**
 * Creates placeholder PNG assets for Expo.
 * Run once: node scripts/create_assets.js
 * Replace with real assets before production.
 */
const fs = require('fs')
const path = require('path')

// Minimal 1x1 transparent PNG (44 bytes)
const TRANSPARENT_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
)

const assetsDir = path.join(__dirname, '..', 'assets')
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })

const files = ['icon.png', 'splash.png', 'adaptive-icon.png', 'favicon.png']
for (const file of files) {
  const dest = path.join(assetsDir, file)
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, TRANSPARENT_PNG)
    console.log(`Created placeholder: assets/${file}`)
  } else {
    console.log(`Skipped (exists): assets/${file}`)
  }
}
console.log('Done. Replace with real assets before publishing.')

#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Define the icon sizes needed for PWA
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Paths
const svgPath = path.join(__dirname, '../frontend/public/icons/icon-base.svg');
const iconsDir = path.join(__dirname, '../frontend/public/icons');

async function generateIcons() {
  try {
    console.log('🎨 Generating PWA icons from SVG...');

    // Ensure the icons directory exists
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }

    // Check if SVG exists
    if (!fs.existsSync(svgPath)) {
      throw new Error(`SVG file not found: ${svgPath}`);
    }

    console.log(`📂 Icons directory: ${iconsDir}`);
    console.log(`🎭 Source SVG: ${svgPath}`);

    // Generate each icon size
    for (const size of iconSizes) {
      const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);

      console.log(`🔄 Generating ${size}x${size} icon...`);

      await sharp(svgPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
        })
        .png({
          quality: 95,
          compressionLevel: 9,
          progressive: true
        })
        .toFile(outputPath);

      console.log(`✅ Created: ${outputPath}`);
    }

    // Generate shortcut icons (96x96)
    console.log('🔄 Generating shortcut icons...');

    // Create a variant for "new story" shortcut
    await sharp(svgPath)
      .resize(96, 96, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png({
        quality: 95,
        compressionLevel: 9
      })
      .toFile(path.join(iconsDir, 'shortcut-new-story.png'));

    // Create a variant for "my stories" shortcut
    await sharp(svgPath)
      .resize(96, 96, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png({
        quality: 95,
        compressionLevel: 9
      })
      .toFile(path.join(iconsDir, 'shortcut-my-stories.png'));

    console.log('✅ Created shortcut icons');

    console.log('\n🎉 All PWA icons generated successfully!');
    console.log('\n📋 Generated files:');

    // List all generated files
    const files = fs.readdirSync(iconsDir).filter(file => file.endsWith('.png'));
    files.forEach(file => {
      const filePath = path.join(iconsDir, file);
      const stats = fs.statSync(filePath);
      console.log(`   📄 ${file} (${Math.round(stats.size / 1024)}KB)`);
    });

  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

// Validate maskable icons note
function validateMaskableDesign() {
  console.log('\n⚠️  IMPORTANT: Maskable Icon Guidelines');
  console.log('   📱 192x192 and 512x512 icons support "maskable" purpose');
  console.log('   🎯 Ensure important content stays within the safe zone (80% of canvas)');
  console.log('   🔗 Test your icons at: https://maskable.app/');
  console.log('   📐 Safe zone: content should be within a circle of radius 40% from center');
}

// Run the generator
if (require.main === module) {
  generateIcons().then(() => {
    validateMaskableDesign();
  });
}

module.exports = { generateIcons };
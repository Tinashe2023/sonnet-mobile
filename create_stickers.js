/**
 * Script to generate placeholder SVG stickers in c:\Sonnet\public\stickers\
 * Run once: node create_stickers.js
 */
const fs = require('fs');
const path = require('path');

const stickersDir = path.join('c:\\Sonnet\\public\\stickers');
if (!fs.existsSync(stickersDir)) {
    fs.mkdirSync(stickersDir, { recursive: true });
    console.log('Created stickers directory:', stickersDir);
}

const stickers = [
    { name: 'happy.svg', emoji: '😊', color: '#FFD700', label: 'Happy' },
    { name: 'love.svg', emoji: '❤️', color: '#FF6B81', label: 'Love' },
    { name: 'laugh.svg', emoji: '😂', color: '#FDCB6E', label: 'Laugh' },
    { name: 'cool.svg', emoji: '😎', color: '#6C5CE7', label: 'Cool' },
    { name: 'sad.svg', emoji: '😢', color: '#74B9FF', label: 'Sad' },
    { name: 'fire.svg', emoji: '🔥', color: '#FF7675', label: 'Fire' },
    { name: 'star.svg', emoji: '⭐', color: '#FFEAA7', label: 'Star' },
    { name: 'thumbsup.svg', emoji: '👍', color: '#55EFC4', label: 'Thumbs Up' },
    { name: 'wave.svg', emoji: '👋', color: '#FFA07A', label: 'Wave' },
    { name: 'party.svg', emoji: '🎉', color: '#A29BFE', label: 'Party' },
    { name: 'clap.svg', emoji: '👏', color: '#FAB1A0', label: 'Clap' },
    { name: 'rainbow.svg', emoji: '🌈', color: '#81ECEC', label: 'Rainbow' },
];

stickers.forEach(({ name, emoji, color, label }) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <circle cx="60" cy="60" r="58" fill="${color}" opacity="0.9" stroke="white" stroke-width="3"/>
  <text x="60" y="72" font-size="52" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  <text x="60" y="108" font-size="11" text-anchor="middle" fill="#333" font-family="Arial, sans-serif" font-weight="bold">${label}</text>
</svg>`;
    const filePath = path.join(stickersDir, name);
    fs.writeFileSync(filePath, svg, 'utf8');
    console.log('Created:', filePath);
});

console.log(`\n✅ Created ${stickers.length} sticker files in ${stickersDir}`);

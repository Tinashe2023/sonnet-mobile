const fs = require('fs');
const s = fs.readFileSync('c:/Sonnet/chatServer.js', 'utf8');
console.log('user_pins migration:', s.includes('user_pins'));
console.log('chats/pins GET route:', s.includes('/chats/pins/:userId'));
console.log('chats/pins POST route:', s.includes("app.post('/chats/pins'"));
console.log('chats/pins DELETE route:', s.includes("app.delete('/chats/pins/:userId/:chatId'"));
console.log('sticker msgKind:', s.includes('msgKind'));
console.log('sticker file_metadata skip:', s.includes("file.kind !== 'sticker'"));
console.log('stickers SVG route:', s.includes("'/stickers'"));
// Count lines
console.log('Total lines in chatServer.js:', s.split('\n').length);

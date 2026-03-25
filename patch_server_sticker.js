/**
 * patch_server_sticker.js – Patches only the sticker kind handling in file-upload
 * Run once: node patch_server_sticker.js
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'c:\\Sonnet\\chatServer.js';
let src = fs.readFileSync(TARGET, 'utf8');

// Already done?
if (src.includes('msgKind')) {
    console.log('⏭️  Already patched, skipping.');
    process.exit(0);
}

// Find the exact DB persist block inside file-upload handler using a unique substring
// We look for the INSERT INTO messages line with 'kind', 'file', which is unique
const OLD = `INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)\r\n                     VALUES ($1, $2, $3, $4, $5, 'file', $6, $7, $8, $9)`;

const NEW = `INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)\r\n                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

if (!src.includes(OLD)) {
    // try LF version
    const OLD_LF = OLD.replace(/\r\n/g, '\n');
    if (src.includes(OLD_LF)) {
        src = src.replace(OLD_LF, NEW.replace(/\r\n/g, '\n'));
        console.log('Replaced (LF version)');
    } else {
        console.error('❌ Cannot find target INSERT block. Manual patch needed.');
        process.exit(1);
    }
} else {
    src = src.replace(OLD, NEW);
    console.log('Replaced (CRLF version)');
}

// Now replace the params array to add msgKind and msgText
// Old params: [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, file.filename || '', fileData.status, file.timestamp || Date.now(), file.replyToId || null]
// This is right after the INSERT block we just changed
const OLD_PARAMS = `[fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, file.filename || '', fileData.status, file.timestamp || Date.now(), file.replyToId || null]`;
const NEW_BLOCK = `// Determine kind and text for DB
                const msgKind = file.kind === 'sticker' ? 'sticker' : 'file';
                const msgText = file.kind === 'sticker' ? (file.text || file.path || '') : (file.filename || '');
                const fileParams = [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, msgKind, msgText, fileData.status, file.timestamp || Date.now(), file.replyToId || null]`;

const OLD_PARAMS_CRLF = OLD_PARAMS;
const OLD_PARAMS_LF = OLD_PARAMS;

if (src.includes(OLD_PARAMS_CRLF)) {
    src = src.replace(OLD_PARAMS_CRLF, NEW_BLOCK);
    console.log('Replaced params array');
} else {
    console.error('❌ Cannot find params array. Manual patch needed.');
    process.exit(1);
}

// Replace the variable reference in the query call
const OLD_QUERY_CALL = `, [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, file.filename || '', fileData.status, file.timestamp || Date.now(), file.replyToId || null]`;
// We just replaced this already above, so now fix the query call to use fileParams
// Actually the approach above inlined the new block as `fileParams` — let's instead just
// do a full block replacement approach.

// Restart: fresh, full-block replacement
let src2 = fs.readFileSync(TARGET, 'utf8');

// Normalize to LF for easier matching
const srcLF = src2.replace(/\r\n/g, '\n');

const TARGET_BLOCK_PATTERN = /\/\/ Persist message \+ file metadata to DB\n\s+try \{[\s\S]*?await query\(\n\s+`INSERT INTO messages \(id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id\)\n\s+VALUES \(\$1, \$2, \$3, \$4, \$5, 'file', \$6, \$7, \$8, \$9\)`[,\r\n\s]+\[fileData\.messageId[\s\S]*?\]\n\s+\);\n\s+await query\(\n\s+`INSERT INTO file_metadata \(message_id, filename, path, mimetype, size\)\n\s+VALUES \(\$1, \$2, \$3, \$4, \$5\)`[,\r\n\s]+\[fileData\.messageId[\s\S]*?\]\n\s+\);\n\s+\} catch \(err\) \{\n\s+console\.error\('Error saving file metadata:', err\);\n\s+\}/;

const REPLACEMENT_BLOCK = `// Persist message + file metadata to DB
            try {
                const msgKind = file.kind === 'sticker' ? 'sticker' : 'file';
                const msgText = file.kind === 'sticker' ? (file.text || file.path || '') : (file.filename || '');
                await query(
                    \`INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)\`,
                    [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, msgKind, msgText, fileData.status, file.timestamp || Date.now(), file.replyToId || null]
                );
                // Only insert file_metadata for actual files (not stickers)
                if (file.kind !== 'sticker') {
                    await query(
                        \`INSERT INTO file_metadata (message_id, filename, path, mimetype, size)
                         VALUES ($1, $2, $3, $4, $5)\`,
                        [fileData.messageId, file.filename, file.path, file.mimetype, file.size]
                    );
                }
            } catch (err) {
                console.error('Error saving file metadata:', err);
            }`;

if (TARGET_BLOCK_PATTERN.test(srcLF)) {
    const patched = srcLF.replace(TARGET_BLOCK_PATTERN, REPLACEMENT_BLOCK);
    // Write back with CRLF
    fs.writeFileSync(TARGET, patched.replace(/\n/g, '\r\n'), 'utf8');
    console.log('✅ Sticker kind handling patched via regex!');
} else {
    console.log('Regex did not match, trying simple string approach...');
    // Simple string approach
    const SIMPLE_OLD = "                await query(\n                    `INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)\n                     VALUES ($1, $2, $3, $4, $5, 'file', $6, $7, $8, $9)`,\n                    [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, file.filename || '', fileData.status, file.timestamp || Date.now(), file.replyToId || null]\n                );\n                await query(\n                    `INSERT INTO file_metadata (message_id, filename, path, mimetype, size)\n                     VALUES ($1, $2, $3, $4, $5)`,\n                    [fileData.messageId, file.filename, file.path, file.mimetype, file.size]\n                );";
    const SIMPLE_NEW = "                const msgKind = file.kind === 'sticker' ? 'sticker' : 'file';\n                const msgText = file.kind === 'sticker' ? (file.text || file.path || '') : (file.filename || '');\n                await query(\n                    `INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)\n                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,\n                    [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, msgKind, msgText, fileData.status, file.timestamp || Date.now(), file.replyToId || null]\n                );\n                if (file.kind !== 'sticker') {\n                    await query(\n                        `INSERT INTO file_metadata (message_id, filename, path, mimetype, size)\n                         VALUES ($1, $2, $3, $4, $5)`,\n                        [fileData.messageId, file.filename, file.path, file.mimetype, file.size]\n                    );\n                }";

    if (srcLF.includes(SIMPLE_OLD)) {
        const patched = srcLF.replace(SIMPLE_OLD, SIMPLE_NEW);
        fs.writeFileSync(TARGET, patched.replace(/\n/g, '\r\n'), 'utf8');
        console.log('✅ Patched via simple string match!');
    } else {
        console.error('❌ Still cannot find block. Dumping first 200 chars around file-upload:');
        const idx = srcLF.indexOf("Persist message + file metadata");
        console.log(JSON.stringify(srcLF.slice(idx, idx + 800)));
    }
}

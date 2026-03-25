/**
 * patch_server.js  – Patches c:\Sonnet\chatServer.js in-place to add:
 *   1. user_pins table migration at startup
 *   2. kind='sticker' support in file-upload socket handler
 *   3. GET/POST/DELETE  /chats/pins/* REST routes
 *
 * Run once: node patch_server.js
 */
const fs = require('fs');
const path = require('path');

const TARGET = path.join('c:\\Sonnet\\chatServer.js');
let src = fs.readFileSync(TARGET, 'utf8');

// ---------------------------------------------------------------
// 1. Add user_pins migration right after the existing migrations
//    section. We look for the startup inline-migration pattern.
// ---------------------------------------------------------------
const MIGRATION_ANCHOR =
    `// Expose stickers list\napp.get('/stickers'`;

const MIGRATION_INSERT = `// === Startup migration: user_pins table ===
(async () => {
    try {
        await query(\`
            CREATE TABLE IF NOT EXISTS user_pins (
                user_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                chat_type TEXT NOT NULL DEFAULT 'private',
                pinned_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
                PRIMARY KEY (user_id, chat_id)
            )
        \`);
        console.log('user_pins table ready');
    } catch (err) {
        console.error('Error creating user_pins table:', err);
    }
})();

// Expose stickers list
app.get('/stickers'`;

if (!src.includes(MIGRATION_INSERT.slice(0, 40))) {
    src = src.replace(MIGRATION_ANCHOR, MIGRATION_INSERT);
    console.log('  ✅ Added user_pins migration');
} else {
    console.log('  ⏭️  user_pins migration already present, skipping');
}

// ---------------------------------------------------------------
// 2. Patch file-upload socket handler to handle kind='sticker'
//    (skip file_metadata insert for stickers)
// ---------------------------------------------------------------
const OLD_FILE_META_INSERT = `            // Persist message + file metadata to DB
            try {
                await query(
                    \`INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)
                     VALUES ($1, $2, $3, $4, $5, 'file', $6, $7, $8, $9)\`,
                    [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, file.filename || '', fileData.status, file.timestamp || Date.now(), file.replyToId || null]
                );
                await query(
                    \`INSERT INTO file_metadata (message_id, filename, path, mimetype, size)
                     VALUES ($1, $2, $3, $4, $5)\`,
                    [fileData.messageId, file.filename, file.path, file.mimetype, file.size]
                );
            } catch (err) {
                console.error('Error saving file metadata:', err);
            }`;

const NEW_FILE_META_INSERT = `            // Persist message + file metadata to DB
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

if (!src.includes('msgKind')) {
    if (src.includes(OLD_FILE_META_INSERT)) {
        src = src.replace(OLD_FILE_META_INSERT, NEW_FILE_META_INSERT);
        console.log('  ✅ Patched file-upload handler for sticker support');
    } else {
        console.warn('  ⚠️  Could not find file-upload DB insert block — manual edit needed');
    }
} else {
    console.log('  ⏭️  Sticker kind handling already present, skipping');
}

// ---------------------------------------------------------------
// 3. Add pinned chats REST routes before the server listen call
// ---------------------------------------------------------------
const LISTEN_ANCHOR = `const PORT = process.env.PORT || 3004;`;

const PIN_ROUTES = `// ── Pinned Chats Endpoints ──────────────────────────────────────

// GET /chats/pins/:userId  —  fetch all pins for a user
app.get('/chats/pins/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await query(
            'SELECT chat_id AS "chatId", chat_type AS "chatType" FROM user_pins WHERE user_id = $1 ORDER BY pinned_at ASC',
            [userId]
        );
        res.json({ pins: result.rows });
    } catch (err) {
        console.error('Error fetching pins:', err);
        res.status(500).json({ error: 'Failed to fetch pins' });
    }
});

// POST /chats/pins  —  pin a chat
app.post('/chats/pins', async (req, res) => {
    try {
        const { userId, chatId, chatType = 'private' } = req.body;
        if (!userId || !chatId) return res.status(400).json({ error: 'userId and chatId required' });
        await query(
            \`INSERT INTO user_pins (user_id, chat_id, chat_type)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, chat_id) DO NOTHING\`,
            [userId, chatId, chatType]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error pinning chat:', err);
        res.status(500).json({ error: 'Failed to pin chat' });
    }
});

// DELETE /chats/pins/:userId/:chatId  —  unpin a chat
app.delete('/chats/pins/:userId/:chatId', async (req, res) => {
    try {
        const { userId, chatId } = req.params;
        await query(
            'DELETE FROM user_pins WHERE user_id = $1 AND chat_id = $2',
            [userId, chatId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error unpinning chat:', err);
        res.status(500).json({ error: 'Failed to unpin chat' });
    }
});

const PORT = process.env.PORT || 3004;`;

if (!src.includes('/chats/pins')) {
    src = src.replace(LISTEN_ANCHOR, PIN_ROUTES);
    console.log('  ✅ Added pinned chats REST routes');
} else {
    console.log('  ⏭️  Pin routes already present, skipping');
}

// ---------------------------------------------------------------
// Write back
// ---------------------------------------------------------------
fs.writeFileSync(TARGET, src, 'utf8');
console.log('\n✅ Patch complete! chatServer.js has been updated.');

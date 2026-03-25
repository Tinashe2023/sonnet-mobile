import { SERVER_URL } from './config';

export async function uploadFile(fileUri, fileName, mimeType, user, timestamp, recipientId, originalFile = null, replyToId = null) {
    const formData = new FormData();

    if (originalFile && typeof window !== 'undefined') {
        // If running on Web, append the actual File/Blob object
        formData.append('file', originalFile);
    } else {
        // React Native (native app) approach
        formData.append('file', {
            uri: fileUri,
            name: fileName,
            type: mimeType,
        });
    }

    formData.append('user', user);
    formData.append('timestamp', String(timestamp));
    if (recipientId) {
        formData.append('recipientId', recipientId);
    }
    if (replyToId) {
        formData.append('replyToId', replyToId);
    }

    const response = await fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        body: formData,
        // The browser/fetch API automatically sets the Content-Type header
        // with the correct boundary when body is FormData.
        // Explicitly setting it to 'multipart/form-data' breaks the upload
        // and causes 500 Internal Server Error on the backend because multer
        // cannot parse it without the generated boundary.
    });
    return response.json();
}

export async function uploadProfilePic(fileUri, fileName, mimeType, originalFile = null) {
    const formData = new FormData();

    if (originalFile && typeof window !== 'undefined') {
        formData.append('profilePic', originalFile);
    } else {
        formData.append('profilePic', {
            uri: fileUri,
            name: fileName,
            type: mimeType || 'image/jpeg',
        });
    }

    const response = await fetch(`${SERVER_URL}/upload-profile`, {
        method: 'POST',
        body: formData,
    });
    return response.json();
}

export async function createRoom() {
    const response = await fetch(`${SERVER_URL}/create-room`);
    return response.json();
}

export async function getUser(userId) {
    const response = await fetch(`${SERVER_URL}/user/${userId}`);
    return response.json();
}

export async function fetchGroupMessages(roomId, limit = 50) {
    const response = await fetch(`${SERVER_URL}/messages/${roomId}?limit=${limit}`);
    return response.json();
}

export async function fetchPrivateMessages(senderId, recipientId, limit = 50) {
    const response = await fetch(`${SERVER_URL}/messages/private/${recipientId}?senderId=${senderId}&limit=${limit}`);
    return response.json();
}

export async function fetchUnreadCounts(userId) {
    const response = await fetch(`${SERVER_URL}/messages/unread/${userId}`);
    return response.json();
}

export async function searchMessages(query, type, roomId = null, recipientId = null, senderId = null) {
    let url = `${SERVER_URL}/messages/search?q=${encodeURIComponent(query)}&type=${type}`;
    if (roomId) url += `&roomId=${roomId}`;
    if (recipientId) url += `&recipientId=${recipientId}`;
    if (senderId) url += `&senderId=${senderId}`;
    const response = await fetch(url);
    return response.json();
}

export async function fetchStickers() {
    const response = await fetch(`${SERVER_URL}/stickers`);
    return response.json();
}

export async function fetchPins(userId) {
    const response = await fetch(`${SERVER_URL}/chats/pins/${userId}`);
    return response.json();
}

export async function pinChat(userId, chatId, chatType = 'private') {
    const response = await fetch(`${SERVER_URL}/chats/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, chatId, chatType }),
    });
    return response.json();
}

export async function unpinChat(userId, chatId) {
    const response = await fetch(`${SERVER_URL}/chats/pins/${userId}/${chatId}`, {
        method: 'DELETE',
    });
    return response.json();
}

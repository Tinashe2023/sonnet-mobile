import React, { useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    ScrollView,
    Image,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Clipboard,
    Modal,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { shadows } from '../theme';
import { SERVER_URL } from '../services/config';
import socket from '../services/socket';
import { uploadFile, fetchGroupMessages, fetchPrivateMessages, fetchUnreadCounts, searchMessages, fetchStickers, fetchPins, pinChat, unpinChat } from '../services/api';
import MessageBubble from '../components/MessageBubble';
import FileBubble from '../components/FileBubble';
import VoiceRecorder from '../components/VoiceRecorder';
import UserProfileModal from '../components/UserProfileModal';
import EmojiPicker from 'rn-emoji-keyboard';


function resolveUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${SERVER_URL}${path}`;
}

export default function ChatScreen({ route, navigation }) {
    const { colors } = useContext(ThemeContext);
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { user } = route.params;
    const currentUser = user;
    const roomId = user.roomId;
    const isPublicRoom = roomId === 'public';
    const isAdmin = currentUser.isAdmin === true;

    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState('');
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [activeChat, setActiveChat] = useState('group');
    const [activeChatUser, setActiveChatUser] = useState(null);
    const [typingUser, setTypingUser] = useState(null);
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
    const [showUsersPanel, setShowUsersPanel] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [profileModalUserId, setProfileModalUserId] = useState(null);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [stickers, setStickers] = useState([]);
    const [pinnedChats, setPinnedChats] = useState(new Set());

    const flatListRef = useRef(null);
    const typingTimerRef = useRef(null);
    const isTypingRef = useRef(false);

    const formatDateHeader = (timestamp) => {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    };

    const messagesWithHeaders = useMemo(() => {
        const result = [];
        let lastDateString = null;

        const sourceData = searchResults !== null ? searchResults : messages;

        sourceData.forEach((msg) => {
            if (!msg.timestamp) return;
            const msgDate = new Date(msg.timestamp).toDateString();
            if (msgDate !== lastDateString) {
                result.push({
                    isDateHeader: true,
                    date: msg.timestamp,
                    id: `date-${msgDate}`,
                });
                lastDateString = msgDate;
            }
            result.push(msg);
        });

        return result;
    }, [messages, searchResults]);

    useEffect(() => {
        const fetchSearch = async () => {
            if (!isSearching || searchQuery.trim().length === 0) {
                setSearchResults(null);
                return;
            }
            try {
                const searchTxt = searchQuery.trim();
                let type = activeChat === 'group' ? 'group' : 'private';
                let roomIdParam = type === 'group' ? roomId : null;
                let recipientId = type === 'group' ? null : activeChat;
                const data = await searchMessages(searchTxt, type, roomIdParam, recipientId, currentUser.id);
                setSearchResults(data.messages || []);
            } catch (err) {
                console.error('Search error:', err);
            }
        };

        const timer = setTimeout(() => {
            fetchSearch();
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, isSearching, activeChat, roomId, currentUser.id]);

    // Ref to always have the latest activeChat inside socket handlers (avoids stale closures)
    const activeChatRef = useRef('group');
    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);

    // Socket event listeners — registered ONCE, use activeChatRef for always-fresh activeChat
    useEffect(() => {
        // Load group message history on mount
        const loadInitialHistory = async () => {
            try {
                const data = await fetchGroupMessages(roomId);
                if (data.messages) {
                    setMessages(data.messages);
                }
                const unreads = await fetchUnreadCounts(currentUser.id);
                if (unreads.unreadCounts) {
                    setUnreadCounts(unreads.unreadCounts);
                }
                // Load pinned chats
                const pinsData = await fetchPins(currentUser.id);
                if (pinsData.pins) {
                    setPinnedChats(new Set(pinsData.pins.map(p => p.chatId)));
                }
                // Load stickers
                const stickersData = await fetchStickers();
                if (stickersData.stickers) {
                    setStickers(stickersData.stickers);
                }
            } catch (err) {
                console.error('Error loading initial history & unreads:', err);
            }
        };
        loadInitialHistory();

        const handleChat = (messageData) => {
            const chat = activeChatRef.current;
            if (messageData.type === 'group' && chat === 'group') {
                setMessages((prev) => {
                    if (prev.some(m => m.messageId === messageData.messageId)) return prev;
                    return [...prev, { ...messageData, kind: 'text' }];
                });
                if (messageData.senderId !== currentUser.id) {
                    socket.emit('message-read', {
                        messageId: messageData.messageId,
                        senderId: messageData.senderId,
                        recipientId: messageData.recipientId,
                        isGroup: true
                    });
                }
            } else if (
                messageData.type === 'private' &&
                (chat === messageData.senderId || chat === messageData.recipientId)
            ) {
                setMessages((prev) => {
                    if (prev.some(m => m.messageId === messageData.messageId)) return prev;
                    return [...prev, { ...messageData, kind: 'text' }];
                });
                if (messageData.senderId !== currentUser.id) {
                    socket.emit('message-read', {
                        messageId: messageData.messageId,
                        senderId: messageData.senderId,
                        recipientId: messageData.recipientId,
                        isGroup: false
                    });
                }
            } else if (messageData.senderId !== currentUser.id) {
                if (messageData.type === 'private') {
                    setUnreadCounts((prev) => ({
                        ...prev,
                        [messageData.senderId]: (prev[messageData.senderId] || 0) + 1
                    }));
                }
                socket.emit('message-delivered', {
                    messageId: messageData.messageId,
                    senderId: messageData.senderId,
                    recipientId: messageData.recipientId,
                    isGroup: messageData.type === 'group'
                });
            }
        };

        const handleFileReceived = (fileData) => {
            const chat = activeChatRef.current;
            if (fileData.type === 'group' && chat === 'group') {
                setMessages((prev) => {
                    if (prev.some(m => m.messageId === fileData.messageId)) return prev;
                    return [...prev, { ...fileData, kind: 'file' }];
                });
                if (fileData.senderId !== currentUser.id) {
                    socket.emit('message-read', {
                        messageId: fileData.messageId,
                        senderId: fileData.senderId,
                        recipientId: fileData.recipientId,
                        isGroup: true
                    });
                }
            } else if (
                fileData.type === 'private' &&
                (chat === fileData.senderId || chat === fileData.recipientId)
            ) {
                setMessages((prev) => {
                    if (prev.some(m => m.messageId === fileData.messageId)) return prev;
                    return [...prev, { ...fileData, kind: 'file' }];
                });
                if (fileData.senderId !== currentUser.id) {
                    socket.emit('message-read', {
                        messageId: fileData.messageId,
                        senderId: fileData.senderId,
                        recipientId: fileData.recipientId,
                        isGroup: false
                    });
                }
            } else if (fileData.senderId !== currentUser.id) {
                if (fileData.type === 'private') {
                    setUnreadCounts((prev) => ({
                        ...prev,
                        [fileData.senderId]: (prev[fileData.senderId] || 0) + 1
                    }));
                }
                socket.emit('message-delivered', {
                    messageId: fileData.messageId,
                    senderId: fileData.senderId,
                    recipientId: fileData.recipientId,
                    isGroup: fileData.type === 'group'
                });
            }
        };

        const handleMessageStatus = ({ messageId, status }) => {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.messageId === messageId ? { ...msg, status } : msg
                )
            );
        };

        const handleMessageDeleted = ({ messageId }) => {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.messageId === messageId
                        ? { ...msg, status: 'deleted', text: '🚫 This message was deleted', kind: 'text' }
                        : msg
                )
            );
        };

        const handleMessageEdited = ({ messageId, newText }) => {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.messageId === messageId ? { ...msg, text: newText, isEdited: true } : msg
                )
            );
        };

        const handleMessageReaction = ({ messageId, userId, emoji }) => {
            setMessages((prev) =>
                prev.map((msg) => {
                    if (msg.messageId === messageId) {
                        const newReactions = { ...(msg.reactions || {}) };
                        if (!emoji) {
                            delete newReactions[userId];
                        } else {
                            newReactions[userId] = emoji;
                        }
                        return { ...msg, reactions: newReactions };
                    }
                    return msg;
                })
            );
        };

        const handleUsersOnline = (users) => {
            setOnlineUsers(users.filter((u) => u.id !== currentUser.id));
        };

        const handleUserTyping = (data) => {
            const chat = activeChatRef.current;
            if (data.userId !== currentUser.id) {
                const isRelevant =
                    (chat === 'group' && !data.recipientId) ||
                    chat === data.userId;
                if (isRelevant) {
                    setTypingUser(data.isTyping ? data.username : null);
                }
            }
        };

        const handleError = (error) => {
            Alert.alert('Error', error.message);
        };

        socket.on('chat', handleChat);
        socket.on('file-received', handleFileReceived);
        socket.on('message-status-update', handleMessageStatus);
        socket.on('message-deleted', handleMessageDeleted);
        socket.on('message-edited', handleMessageEdited);
        socket.on('message-reaction', handleMessageReaction);
        socket.on('users-online', handleUsersOnline);
        socket.on('user-typing', handleUserTyping);
        socket.on('error', handleError);

        return () => {
            socket.off('chat', handleChat);
            socket.off('file-received', handleFileReceived);
            socket.off('message-status-update', handleMessageStatus);
            socket.off('message-deleted', handleMessageDeleted);
            socket.off('message-edited', handleMessageEdited);
            socket.off('message-reaction', handleMessageReaction);
            socket.off('users-online', handleUsersOnline);
            socket.off('user-typing', handleUserTyping);
            socket.off('error', handleError);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only register once — activeChat is read via activeChatRef

    // Scroll to bottom on new messages
    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

    const handleSendMessage = () => {
        const text = messageText.trim();
        if (!text) return;

        if (editingMessage) {
            socket.emit('edit-message', {
                messageId: editingMessage.messageId,
                type: editingMessage.type,
                recipientId: editingMessage.recipientId,
                newText: text,
            });
            setMessageText('');
            setEditingMessage(null);
            return;
        }

        const messageData = {
            text,
            timestamp: Date.now(),
            replyToId: replyingTo ? replyingTo.messageId : null,
            ...(replyingTo && {
                replyToText: replyingTo.text,
                replyToSenderName: replyingTo.senderName,
                replyToKind: replyingTo.kind,
            }),
        };

        if (activeChat === 'group') {
            socket.emit('group-message', messageData);
        } else {
            socket.emit('private-message', {
                recipientId: activeChat,
                message: messageData,
            });
        }

        setMessageText('');
        setReplyingTo(null);
    };

    const handleTyping = (text) => {
        setMessageText(text);

        if (!isTypingRef.current) {
            isTypingRef.current = true;
            socket.emit('typing', {
                recipientId: activeChat === 'group' ? null : activeChat,
                isTyping: true,
            });
        }

        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            isTypingRef.current = false;
            socket.emit('typing', {
                recipientId: activeChat === 'group' ? null : activeChat,
                isTyping: false,
            });
        }, 1000);
    };

    const handleFilePick = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });

            if (!result.canceled && result.assets && result.assets[0]) {
                const file = result.assets[0];
                const recipientId = activeChat !== 'group' ? activeChat : null;

                const uploadResult = await uploadFile(
                    file.uri,
                    file.name,
                    file.mimeType || 'application/octet-stream',
                    currentUser.username,
                    Date.now(),
                    recipientId,
                    file.file, // Pass the original web File object if it exists
                    replyingTo ? replyingTo.messageId : null
                );

                if (uploadResult.file) {
                    socket.emit('file-upload', {
                        ...uploadResult.file,
                        recipientId,
                        replyToId: replyingTo ? replyingTo.messageId : null,
                        ...(replyingTo && {
                            replyToText: replyingTo.text,
                            replyToSenderName: replyingTo.senderName,
                            replyToKind: replyingTo.kind,
                        }),
                    });
                    setReplyingTo(null);
                }
            }
        } catch (error) {
            console.error('Error picking/uploading file:', error);
            Alert.alert('Error', 'Failed to upload file');
        }
    };

    const switchToGroupChat = async () => {
        setActiveChat('group');
        setActiveChatUser(null);
        setMessages([]);
        setTypingUser(null);
        setShowUsersPanel(false);
        // Load group message history
        try {
            const data = await fetchGroupMessages(roomId);
            if (data.messages) {
                setMessages(data.messages);
            }
        } catch (err) {
            console.error('Error loading group history:', err);
        }
    };

    const switchToPrivateChat = async (targetUser) => {
        setActiveChat(targetUser.id);
        setActiveChatUser(targetUser);
        setMessages([]);
        setTypingUser(null);
        setShowUsersPanel(false);
        setUnreadCounts((prev) => ({ ...prev, [targetUser.id]: 0 }));
        socket.emit('mark-chat-read', { senderId: targetUser.id });
        // Load private message history
        try {
            const data = await fetchPrivateMessages(currentUser.id, targetUser.id);
            if (data.messages) {
                setMessages(data.messages);
            }
        } catch (err) {
            console.error('Error loading private history:', err);
        }
    };

    const handleCopyRoomLink = () => {
        if (roomId && roomId !== 'public') {
            const link = `Room ID: ${roomId}`;
            Clipboard.setString(link);
            Alert.alert('Copied!', 'Room ID copied to clipboard');
        }
    };

    const getChatTitle = () => {
        if (activeChat !== 'group' && activeChatUser) {
            return activeChatUser.username;
        }
        if (isPublicRoom) return '📢 Announcements';
        return `Private Room (${roomId})`;
    };

    const getChatStatus = () => {
        if (typingUser) return 'typing...';
        if (activeChat !== 'group') return 'Online';
        return `${onlineUsers.length + 1} members`;
    };

    const getChatAvatar = () => {
        if (activeChat !== 'group' && activeChatUser) {
            return resolveUrl(activeChatUser.profilePic);
        }
        return null;
    };

    const handleLongPress = (msg) => {
        if (msg.status !== 'deleted') {
            setSelectedMessage(msg);
        }
    };

    const handleEdit = () => {
        setEditingMessage(selectedMessage);
        setMessageText(selectedMessage.text);
        setSelectedMessage(null);
        setReplyingTo(null);
    };

    const handleReply = () => {
        setReplyingTo(selectedMessage);
        setSelectedMessage(null);
    };

    const handleDelete = () => {
        if (!selectedMessage || selectedMessage.senderId !== currentUser.id) return;
        socket.emit('delete-message', {
            messageId: selectedMessage.messageId,
            type: selectedMessage.type,
            recipientId: selectedMessage.recipientId,
        });
        setSelectedMessage(null);
    };

    const handleForward = () => {
        Alert.alert('Forward', 'Select a chat to forward to (coming soon)');
        setSelectedMessage(null);
    };

    const handleSendSticker = (stickerPath) => {
        const recipientId = activeChat !== 'group' ? activeChat : null;
        const stickerUrl = stickerPath.startsWith('http') ? stickerPath : `${SERVER_URL}${stickerPath}`;
        socket.emit('file-upload', {
            kind: 'sticker',
            filename: stickerPath.split('/').pop(),
            path: stickerPath,
            text: stickerUrl,
            mimetype: 'image/svg+xml',
            size: 0,
            timestamp: Date.now(),
            recipientId,
        });
        setShowStickerPicker(false);
    };

    const handlePinToggle = async (targetUser) => {
        const isPinned = pinnedChats.has(targetUser.id);
        Alert.alert(
            isPinned ? 'Unpin Chat' : 'Pin Chat',
            isPinned
                ? `Remove ${targetUser.username} from pinned?`
                : `Pin ${targetUser.username} to the top?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: isPinned ? '📌 Unpin' : '📌 Pin',
                    onPress: async () => {
                        try {
                            if (isPinned) {
                                await unpinChat(currentUser.id, targetUser.id);
                                setPinnedChats(prev => { const s = new Set(prev); s.delete(targetUser.id); return s; });
                            } else {
                                await pinChat(currentUser.id, targetUser.id, 'private');
                                setPinnedChats(prev => new Set([...prev, targetUser.id]));
                            }
                        } catch (err) {
                            console.error('Error toggling pin:', err);
                            Alert.alert('Error', 'Could not update pin.');
                        }
                    },
                },
            ]
        );
    };

    const handleReaction = (emoji) => {
        if (!selectedMessage) return;
        socket.emit('react-message', {
            messageId: selectedMessage.messageId,
            type: selectedMessage.type,
            recipientId: selectedMessage.recipientId,
            emoji: emoji,
        });
        setSelectedMessage(null);
    };

    const sortedOnlineUsers = useMemo(() => {
        const pinned = onlineUsers.filter(u => pinnedChats.has(u.id));
        const rest = onlineUsers.filter(u => !pinnedChats.has(u.id));
        return [...pinned, ...rest];
    }, [onlineUsers, pinnedChats]);

    const renderMessage = useCallback(
        ({ item }) => {
            const isSender = item.senderId === currentUser.id;
            const isGroup = item.type === 'group';

            if (item.kind === 'sticker') {
                const stickerUri = item.text && item.text.startsWith('http')
                    ? item.text
                    : item.path ? `${SERVER_URL}${item.path}` : null;
                return (
                    <View style={[styles.stickerWrapper, isSender ? styles.stickerWrapperRight : styles.stickerWrapperLeft]}>
                        {stickerUri ? (
                            <Image source={{ uri: stickerUri }} style={styles.stickerImage} resizeMode="contain" />
                        ) : (
                            <Text style={{ fontSize: 40 }}>🎭</Text>
                        )}
                    </View>
                );
            }

            if (item.kind === 'file') {
                return (
                    <FileBubble
                        file={item}
                        isSender={isSender}
                        isGroup={isGroup}
                        onAvatarPress={(userId) => setProfileModalUserId(userId)}
                        onLongPress={handleLongPress}
                    />
                );
            }

            return (
                <MessageBubble
                    message={item}
                    isSender={isSender}
                    isGroup={isGroup}
                    onAvatarPress={(userId) => setProfileModalUserId(userId)}
                    onLongPress={handleLongPress}
                />
            );
        },
        [currentUser.id, pinnedChats]
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.menuBtn}
                    onPress={() => setShowUsersPanel(!showUsersPanel)}
                >
                    <Text style={styles.menuIcon}>☰</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.headerContent}
                    onPress={() => {
                        if (activeChatUser) {
                            setProfileModalUserId(activeChatUser.id);
                        }
                    }}
                >
                    {getChatAvatar() ? (
                        <Image source={{ uri: getChatAvatar() }} style={styles.chatAvatar} />
                    ) : (
                        <View style={styles.groupAvatarPlaceholder}>
                            <Text style={styles.groupAvatarText}>💬</Text>
                        </View>
                    )}
                    <View style={styles.headerText}>
                        <Text style={styles.chatTitle} numberOfLines={1}>
                            {getChatTitle()}
                        </Text>
                        <Text
                            style={[
                                styles.chatStatus,
                                typingUser ? { color: colors.primaryGreen } : null,
                            ]}
                        >
                            {getChatStatus()}
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconBtn} onPress={() => { setIsSearching(!isSearching); setSearchQuery(''); setSearchResults(null); }}>
                    <Text style={styles.iconBtnText}>🔍</Text>
                </TouchableOpacity>

                {roomId && roomId !== 'public' && (
                    <TouchableOpacity style={styles.iconBtn} onPress={handleCopyRoomLink}>
                        <Text style={styles.iconBtnText}>🔗</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Search Bar */}
            {isSearching && (
                <View style={styles.searchBarContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search messages..."
                        placeholderTextColor={colors.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus
                    />
                    <TouchableOpacity style={styles.clearSearchBtn} onPress={() => { setSearchQuery(''); setIsSearching(false); setSearchResults(null); }}>
                        <Text style={styles.clearSearchIcon}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Users Panel (Slide-over) */}
            {showUsersPanel && (
                <View style={styles.usersPanel}>
                    {/* Current user info */}
                    <View style={styles.currentUserSection}>
                        <Image
                            source={{
                                uri: resolveUrl(currentUser.profilePic) || `${SERVER_URL}/uploads/profiles/default-profile.jpg`,
                            }}
                            style={styles.currentUserAvatar}
                        />
                        <View>
                            <Text style={styles.currentUserName}>{currentUser.username}</Text>
                            <Text style={styles.currentUserId}>ID: {currentUser.id}</Text>
                        </View>
                    </View>

                    {/* Group chat tab */}
                    <TouchableOpacity
                        style={[
                            styles.groupTab,
                            activeChat === 'group' && styles.groupTabActive,
                        ]}
                        onPress={switchToGroupChat}
                    >
                        <Text
                            style={[
                                styles.groupTabText,
                                activeChat === 'group' && styles.groupTabTextActive,
                            ]}
                        >
                            {isPublicRoom ? '📢 Announcements' : '💬 Group Chat'}
                        </Text>
                    </TouchableOpacity>

                    {/* Online users */}
                    <View style={styles.usersHeader}>
                        <Text style={styles.usersHeaderText}>
                            Online Users ({onlineUsers.length + 1})
                        </Text>
                    </View>

                    <FlatList
                        data={sortedOnlineUsers}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => {
                            const isPinned = pinnedChats.has(item.id);
                            return (
                                <TouchableOpacity
                                    style={[
                                        styles.userItem,
                                        activeChat === item.id && styles.userItemActive,
                                        isPinned && styles.userItemPinned,
                                    ]}
                                    onPress={() => switchToPrivateChat(item)}
                                    onLongPress={() => handlePinToggle(item)}
                                    delayLongPress={400}
                                >
                                    <Image
                                        source={{
                                            uri: resolveUrl(item.profilePic) || `${SERVER_URL}/uploads/profiles/default-profile.jpg`,
                                        }}
                                        style={styles.userAvatar}
                                    />
                                    <View style={styles.userDetails}>
                                        <View style={styles.userNameRow}>
                                            <Text style={styles.userName}>{item.username}</Text>
                                            {isPinned && <Text style={styles.pinIcon}>📌</Text>}
                                        </View>
                                        <Text style={styles.userId}>ID: {item.id}</Text>
                                    </View>
                                    {unreadCounts[item.id] > 0 && (
                                        <View style={styles.unreadBadge}>
                                            <Text style={styles.unreadBadgeText}>{unreadCounts[item.id]}</Text>
                                        </View>
                                    )}
                                    <View style={styles.statusDot} />
                                </TouchableOpacity>
                            );
                        }}
                        style={styles.usersList}
                    />
                </View>
            )}

            {/* Messages */}
            <View style={styles.messagesArea}>
                <FlatList
                    ref={flatListRef}
                    data={messagesWithHeaders}
                    keyExtractor={(item, index) => item.isDateHeader ? item.id : (item.messageId || `msg-${index}`)}
                    renderItem={({ item, index }) => {
                        if (item.isDateHeader) {
                            return (
                                <View style={styles.dateHeaderContainer}>
                                    <Text style={styles.dateHeaderText}>{formatDateHeader(item.date)}</Text>
                                </View>
                            );
                        }
                        return renderMessage({ item });
                    }}
                    contentContainerStyle={styles.messagesContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {activeChat === 'group'
                                    ? 'No messages yet. Start the conversation! 💬'
                                    : `Start a private conversation 🔒`}
                            </Text>
                        </View>
                    }
                />

                {typingUser && (
                    <View style={styles.typingBar}>
                        <Text style={styles.typingText}>{typingUser} is typing...</Text>
                    </View>
                )}
            </View>

            {/* Voice Recorder */}
            {showVoiceRecorder && (
                <VoiceRecorder
                    currentUser={currentUser}
                    activeChat={activeChat}
                    onClose={() => setShowVoiceRecorder(false)}
                />
            )}

            {/* Reply Preview */}
            {replyingTo && (
                <View style={styles.replyPreviewContainer}>
                    <View style={styles.replyPreviewBar} />
                    <View style={styles.replyPreviewContent}>
                        <Text style={styles.replyPreviewName}>{replyingTo.senderName}</Text>
                        <Text style={styles.replyPreviewText} numberOfLines={1}>
                            {replyingTo.kind === 'file' ? '📄 File' : replyingTo.text}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.closeReplyBtn} onPress={() => setReplyingTo(null)}>
                        <Text style={styles.closeReplyIcon}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Editing Preview */}
            {editingMessage && (
                <View style={styles.replyPreviewContainer}>
                    <View style={styles.replyPreviewBar} />
                    <View style={styles.replyPreviewContent}>
                        <Text style={styles.replyPreviewName}>Editing Message</Text>
                        <Text style={styles.replyPreviewText} numberOfLines={1}>
                            {editingMessage.text}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.closeReplyBtn} onPress={() => { setEditingMessage(null); setMessageText(''); }}>
                        <Text style={styles.closeReplyIcon}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Input Area / Broadcast Banner */}
            {!showVoiceRecorder && (
                // Show read-only banner for non-admins in public room group chat
                (isPublicRoom && activeChat === 'group' && !isAdmin) ? (
                    <View style={styles.broadcastBanner}>
                        <Text style={styles.broadcastIcon}>📢</Text>
                        <Text style={styles.broadcastText}>This is a broadcast channel. Only admins can post here.</Text>
                    </View>
                ) : (
                <View style={styles.inputArea}>
                    <View style={styles.inputRow}>
                        <TouchableOpacity style={styles.attachBtn} onPress={() => setIsEmojiPickerOpen(true)}>
                            <Text style={styles.attachIcon}>😀</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.attachBtn} onPress={() => setShowStickerPicker(true)}>
                            <Text style={styles.attachIcon}>🎭</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.attachBtn} onPress={handleFilePick}>
                            <Text style={styles.attachIcon}>📎</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.voiceBtn}
                            onPress={() => setShowVoiceRecorder(true)}
                        >
                            <Text style={styles.voiceIcon}>🎤</Text>
                        </TouchableOpacity>

                        <TextInput
                            style={styles.messageInput}
                            placeholder="Type a message..."
                            placeholderTextColor={colors.textMuted}
                            value={messageText}
                            onChangeText={handleTyping}
                            multiline
                            maxLength={2000}
                        />

                        <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
                            <Text style={styles.sendIcon}>➤</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                )
            )}

            {/* User Profile Modal */}
            <UserProfileModal
                visible={!!profileModalUserId}
                userId={profileModalUserId}
                onClose={() => setProfileModalUserId(null)}
            />

            {/* Emoji Picker */}
            <EmojiPicker
                onEmojiSelected={(emojiObject) => {
                    setMessageText((prev) => prev + emojiObject.emoji);
                }}
                open={isEmojiPickerOpen}
                onClose={() => setIsEmojiPickerOpen(false)}
                expandable={false}
                theme={{
                    backdrop: colors.overlay,
                    knob: colors.primaryGreen,
                    container: colors.headerDark,
                    header: colors.textPrimary,
                    category: {
                        icon: colors.textMuted,
                        iconActive: colors.primaryGreen,
                    },
                    search: {
                        text: colors.textPrimary,
                        placeholder: colors.textMuted,
                    }
                }}
            />

            {/* Sticker Picker Modal */}
            <Modal
                visible={showStickerPicker}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowStickerPicker(false)}
            >
                <TouchableOpacity
                    style={styles.stickerModalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowStickerPicker(false)}
                >
                    <View style={styles.stickerModalContainer}>
                        <View style={styles.stickerModalHeader}>
                            <Text style={styles.stickerModalTitle}>🎭 Stickers</Text>
                            <TouchableOpacity onPress={() => setShowStickerPicker(false)}>
                                <Text style={styles.stickerModalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        {stickers.length === 0 ? (
                            <View style={styles.stickerEmptyContainer}>
                                <Text style={styles.stickerEmptyText}>No stickers available</Text>
                            </View>
                        ) : (
                            <ScrollView contentContainerStyle={styles.stickerGrid}>
                                {stickers.map((stickerPath, index) => {
                                    const stickerUri = stickerPath.startsWith('http')
                                        ? stickerPath
                                        : `${SERVER_URL}${stickerPath}`;
                                    return (
                                        <TouchableOpacity
                                            key={index}
                                            style={styles.stickerItem}
                                            onPress={() => handleSendSticker(stickerPath)}
                                        >
                                            <Image
                                                source={{ uri: stickerUri }}
                                                style={styles.stickerThumbnail}
                                                resizeMode="contain"
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Action Menu Modal */}
            <Modal
                visible={!!selectedMessage}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedMessage(null)}
            >
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
                    <View style={[styles.actionMenu, { paddingVertical: 0 }]}>
                        <View style={styles.reactionRow}>
                            {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                                <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => handleReaction(emoji)}>
                                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.actionMenuDivider} />
                        <TouchableOpacity style={styles.actionItem} onPress={handleReply}>
                            <Text style={styles.actionText}>↩️ Reply</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionItem} onPress={handleForward}>
                            <Text style={styles.actionText}>⏩ Forward</Text>
                        </TouchableOpacity>
                        {selectedMessage?.senderId === currentUser.id && selectedMessage?.kind === 'text' && (Date.now() - (selectedMessage.timestamp || Date.now()) < 15 * 60 * 1000) && (
                            <TouchableOpacity style={styles.actionItem} onPress={handleEdit}>
                                <Text style={styles.actionText}>✏️ Edit</Text>
                            </TouchableOpacity>
                        )}
                        {selectedMessage?.senderId === currentUser.id && (
                            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
                                <Text style={[styles.actionText, { color: 'red' }]}>🗑️ Delete</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const getStyles = (colors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.chatBg,
    },

    // Header
    header: {
        backgroundColor: colors.headerDark,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        paddingTop: Platform.OS === 'ios' ? 50 : 10,
        gap: 8,
        ...shadows.small,
    },
    menuBtn: {
        padding: 6,
    },
    menuIcon: {
        fontSize: 22,
        color: '#ffffff',
    },
    headerContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    chatAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    groupAvatarPlaceholder: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    groupAvatarText: {
        fontSize: 20,
    },
    headerText: {
        flex: 1,
    },
    chatTitle: {
        fontSize: 17,
        fontWeight: '500',
        color: '#ffffff',
    },
    chatStatus: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 1,
    },
    iconBtn: {
        padding: 8,
    },
    iconBtnText: {
        fontSize: 18,
    },

    // Users Panel
    usersPanel: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '80%',
        maxWidth: 320,
        backgroundColor: colors.sidebarBg,
        zIndex: 100,
        ...shadows.large,
        paddingTop: Platform.OS === 'ios' ? 50 : 0,
    },
    currentUserSection: {
        backgroundColor: colors.headerDark,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    currentUserAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    currentUserName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    currentUserId: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
    },
    groupTab: {
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderMedium,
        backgroundColor: colors.inputBg,
    },
    groupTabActive: {
        backgroundColor: colors.white,
        borderLeftWidth: 3,
        borderLeftColor: colors.primaryGreen,
    },
    groupTabText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    groupTabTextActive: {
        color: colors.textPrimary,
    },
    usersHeader: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        backgroundColor: colors.inputBg,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderMedium,
    },
    usersHeaderText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    usersList: {
        flex: 1,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 18,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    userItemActive: {
        backgroundColor: colors.receivedBubble,
        borderLeftWidth: 3,
        borderLeftColor: colors.primaryGreen,
    },
    userAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    userDetails: {
        flex: 1,
    },
    userName: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    userId: {
        fontSize: 11,
        color: colors.textMuted,
    },
    unreadBadge: {
        backgroundColor: colors.primaryGreen,
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        minWidth: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
    },
    unreadBadgeText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.online,
    },
    userItemPinned: {
        backgroundColor: 'rgba(0, 168, 132, 0.1)',
        borderLeftWidth: 3,
        borderLeftColor: '#FFD700',
    },
    userNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    pinIcon: {
        fontSize: 12,
    },

    // Reply Preview Area
    replyPreviewContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 8,
        marginHorizontal: 12,
        marginBottom: 8,
        padding: 8,
        alignItems: 'center',
    },
    replyPreviewBar: {
        width: 4,
        backgroundColor: colors.primaryGreen,
        borderRadius: 2,
        alignSelf: 'stretch',
    },
    replyPreviewContent: {
        flex: 1,
        paddingHorizontal: 8,
    },
    replyPreviewName: {
        fontSize: 13,
        fontWeight: 'bold',
        color: colors.primaryGreen,
        marginBottom: 2,
    },
    replyPreviewText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    closeReplyBtn: {
        padding: 8,
    },
    closeReplyIcon: {
        fontSize: 18,
        color: colors.textMuted,
    },

    // Modal & Menu
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionMenu: {
        width: 250,
        backgroundColor: colors.white,
        borderRadius: 12,
        paddingVertical: 8,
        ...shadows.medium,
        overflow: 'hidden',
    },
    reactionRow: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 12,
        justifyContent: 'space-between',
        backgroundColor: colors.white,
    },
    reactionBtn: {
        padding: 4,
    },
    reactionEmoji: {
        fontSize: 24,
    },
    actionMenuDivider: {
        height: 1,
        backgroundColor: colors.borderLight,
    },
    actionItem: {
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    actionText: {
        fontSize: 16,
        color: colors.textPrimary,
    },

    dateHeaderContainer: {
        alignSelf: 'center',
        backgroundColor: colors.headerDark,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        marginVertical: 10,
        ...shadows.small,
    },
    dateHeaderText: {
        fontSize: 12,
        color: '#ffffff',
        fontWeight: 'bold',
    },

    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        backgroundColor: colors.inputBg,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        fontSize: 15,
        color: colors.textPrimary,
    },
    clearSearchBtn: {
        padding: 8,
    },
    clearSearchIcon: {
        fontSize: 18,
        color: colors.textMuted,
    },

    // Messages
    messagesArea: {
        flex: 1,
    },
    messagesContent: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexGrow: 1,
        justifyContent: 'flex-end',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 15,
        color: colors.textMuted,
        textAlign: 'center',
    },
    typingBar: {
        paddingHorizontal: 20,
        paddingVertical: 6,
    },
    typingText: {
        fontSize: 13,
        fontStyle: 'italic',
        color: colors.textMuted,
    },

    // Input Area
    inputArea: {
        backgroundColor: colors.inputBg,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: 25,
        paddingHorizontal: 10,
        paddingVertical: 4,
        gap: 6,
        ...shadows.small,
    },
    attachBtn: {
        padding: 6,
    },
    attachIcon: {
        fontSize: 22,
        color: colors.textMuted,
    },
    voiceBtn: {
        padding: 6,
    },
    voiceIcon: {
        fontSize: 20,
        color: colors.textMuted,
    },
    messageInput: {
        flex: 1,
        fontSize: 15,
        paddingVertical: 8,
        paddingHorizontal: 8,
        maxHeight: 100,
        color: colors.textPrimary,
    },
    sendBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.primaryGreen,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendIcon: {
        fontSize: 18,
        color: '#ffffff',
    },

    // Sticker styles
    stickerWrapper: {
        marginVertical: 4,
        marginHorizontal: 12,
    },
    stickerWrapperRight: {
        alignItems: 'flex-end',
    },
    stickerWrapperLeft: {
        alignItems: 'flex-start',
    },
    stickerImage: {
        width: 120,
        height: 120,
    },
    stickerModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    stickerModalContainer: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: 300,
        paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    },
    stickerModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    stickerModalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    stickerModalClose: {
        fontSize: 18,
        color: colors.textMuted,
        padding: 4,
    },
    stickerGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8,
    },
    stickerItem: {
        width: 80,
        height: 80,
        borderRadius: 12,
        backgroundColor: colors.inputBg,
        justifyContent: 'center',
        alignItems: 'center',
        ...shadows.small,
    },
    stickerThumbnail: {
        width: 64,
        height: 64,
    },
    stickerEmptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    stickerEmptyText: {
        fontSize: 14,
        color: colors.textMuted,
    },

    // Broadcast Banner (read-only public chat)
    broadcastBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.headerDark,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    broadcastIcon: {
        fontSize: 20,
    },
    broadcastText: {
        flex: 1,
        fontSize: 13,
        color: colors.textOnDark,
        fontStyle: 'italic',
    },
});

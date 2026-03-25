import React, { useMemo, useContext, useState } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';

import { SERVER_URL } from '../services/config';

function resolveUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${SERVER_URL}${path}`;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, isSender, isGroup, onAvatarPress, onLongPress }) {
    const { colors } = useContext(ThemeContext);
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [isHovered, setIsHovered] = useState(false);

    const reactionCounts = {};
    if (message.reactions) {
        Object.values(message.reactions).forEach(emoji => {
            if (emoji) {
                reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
            }
        });
    }
    const hasReactions = Object.keys(reactionCounts).length > 0;

    return (
        <View style={[styles.container, isSender ? styles.sent : styles.received]}>
            {!isSender && (
                <TouchableOpacity onPress={() => onAvatarPress?.(message.senderId)}>
                    <Image
                        source={{ uri: resolveUrl(message.senderProfile) || `${SERVER_URL}/uploads/profiles/default-profile.jpg` }}
                        style={styles.avatar}
                    />
                </TouchableOpacity>
            )}

            <View
                style={[styles.bubbleWrapper, isSender ? styles.sent : styles.received]}
                onMouseEnter={() => Platform.OS === 'web' && setIsHovered(true)}
                onMouseLeave={() => Platform.OS === 'web' && setIsHovered(false)}
            >
                <TouchableOpacity
                    activeOpacity={0.8}
                    onLongPress={() => onLongPress?.(message)}
                    delayLongPress={300}
                    style={[styles.bubble, isSender ? styles.sentBubble : styles.receivedBubble]}
                >
                    {isHovered && message.status !== 'deleted' && Platform.OS === 'web' && (
                        <TouchableOpacity
                            style={styles.webMenuBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                onLongPress?.(message);
                            }}
                        >
                            <Text style={styles.webMenuIcon}>⌄</Text>
                        </TouchableOpacity>
                    )}
                    {!isSender && isGroup && (
                        <TouchableOpacity onPress={() => onAvatarPress?.(message.senderId)}>
                            <Text style={styles.senderName}>{message.senderName}</Text>
                        </TouchableOpacity>
                    )}

                    {message.replyToId && (
                        <View style={styles.replyContext}>
                            <Text style={styles.replyContextName}>{message.replyToSenderName}</Text>
                            <Text style={styles.replyContextText} numberOfLines={1}>
                                {message.replyToKind === 'file' ? '📄 File' : message.replyToText}
                            </Text>
                        </View>
                    )}

                    <Text style={[styles.messageText, message.status === 'deleted' && styles.deletedText]}>
                        {message.text}
                    </Text>

                    <View style={styles.timeContainer}>
                        {message.isEdited && (
                            <Text style={styles.editedText}>(edited)</Text>
                        )}
                        <Text style={styles.messageTime}>
                            {formatTime(message.timestamp || Date.now())}
                        </Text>
                        {isSender && (
                            <Text style={[
                                styles.statusTick,
                                message.status === 'read' ? styles.statusRead : null
                            ]}>
                                {message.status === 'read' || message.status === 'delivered' ? ' ✓✓' : ' ✓'}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>

                {hasReactions && (
                    <View style={[styles.reactionsContainer, isSender ? styles.reactionsSent : styles.reactionsReceived]}>
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                            <View key={emoji} style={styles.reactionBadge}>
                                <Text style={styles.reactionBadgeEmoji}>{emoji}</Text>
                                {count > 1 && <Text style={styles.reactionBadgeCount}>{count}</Text>}
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </View>
    );
}

const getStyles = (colors) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 4,
        maxWidth: '80%',
        gap: 6,
    },
    sent: {
        alignSelf: 'flex-end',
        flexDirection: 'row-reverse',
    },
    received: {
        alignSelf: 'flex-start',
    },
    avatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
    },
    bubbleWrapper: {
        maxWidth: '100%',
        position: 'relative',
    },
    bubble: {
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        maxWidth: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 1,
        position: 'relative',
    },
    sentBubble: {
        backgroundColor: colors.sentBubble,
        borderBottomRightRadius: 4,
    },
    receivedBubble: {
        backgroundColor: colors.receivedBubble,
        borderBottomLeftRadius: 4,
    },
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.primaryGreen,
        marginBottom: 2,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
        color: colors.textPrimary,
    },
    deletedText: {
        fontStyle: 'italic',
        color: colors.textMuted,
    },
    replyContext: {
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderLeftWidth: 4,
        borderLeftColor: colors.primaryGreen,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 6,
        borderTopLeftRadius: 4,
        borderBottomLeftRadius: 4,
        marginBottom: 4,
    },
    replyContextName: {
        fontSize: 13,
        fontWeight: 'bold',
        color: colors.primaryGreen,
        marginBottom: 2,
    },
    replyContextText: {
        fontSize: 13,
        color: 'rgba(0,0,0,0.65)',
    },
    timeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 3,
    },
    messageTime: {
        fontSize: 11,
        color: colors.textMuted,
    },
    editedText: {
        fontSize: 10,
        color: colors.textMuted,
        marginRight: 4,
        fontStyle: 'italic',
    },
    statusTick: {
        fontSize: 11,
        color: colors.textMuted,
        marginLeft: 4,
    },
    statusRead: {
        color: '#34B7F1',
    },
    webMenuBtn: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    webMenuIcon: {
        fontSize: 16,
        color: colors.textMuted,
        marginTop: -4,
    },
    reactionsContainer: {
        flexDirection: 'row',
        position: 'absolute',
        bottom: -12,
        backgroundColor: colors.white,
        borderRadius: 12,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: colors.chatBg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
        elevation: 1,
        zIndex: 5,
    },
    reactionsSent: {
        right: 12,
    },
    reactionsReceived: {
        left: 12,
    },
    reactionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 2,
    },
    reactionBadgeEmoji: {
        fontSize: 12,
    },
    reactionBadgeCount: {
        fontSize: 11,
        color: colors.textMuted,
        marginLeft: 2,
        fontWeight: '500',
    },
});

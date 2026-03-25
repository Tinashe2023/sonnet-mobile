import React, { useMemo, useContext, useState, useRef } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { Audio } from 'expo-av';

import { SERVER_URL } from '../services/config';

function resolveUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${SERVER_URL}${path}`;
}

function formatTime(timestamp) {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
    const date = new Date(ts || Date.now());
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(millis) {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function FileBubble({ file, isSender, isGroup, onAvatarPress, onLongPress }) {
    const { colors } = useContext(ThemeContext);
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const soundRef = useRef(null);

    const reactionCounts = {};
    if (file.reactions) {
        Object.values(file.reactions).forEach(emoji => {
            if (emoji) {
                reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
            }
        });
    }
    const hasReactions = Object.keys(reactionCounts).length > 0;

    const isVoice = file.isVoiceMessage || (file.filename && file.filename.includes('voice-'));
    const isImage = file.mimetype && file.mimetype.startsWith('image/');
    const fileUrl = resolveUrl(file.path);

    const handlePlayVoice = async () => {
        try {
            if (soundRef.current) {
                if (isPlaying) {
                    await soundRef.current.pauseAsync();
                    setIsPlaying(false);
                } else {
                    await soundRef.current.playAsync();
                    setIsPlaying(true);
                }
                return;
            }

            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
            });

            const { sound } = await Audio.Sound.createAsync(
                { uri: fileUrl },
                { shouldPlay: true },
                (status) => {
                    if (status.isLoaded) {
                        setPlaybackPosition(status.positionMillis);
                        setPlaybackDuration(status.durationMillis || 0);
                        if (status.didJustFinish) {
                            setIsPlaying(false);
                            soundRef.current = null;
                        }
                    }
                }
            );

            soundRef.current = sound;
            setIsPlaying(true);
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    };

    const handleOpenFile = async () => {
        if (fileUrl) {
            if (Platform.OS === 'web') {
                try {
                    // Fetch the file, convert to a blob, and trigger a download link
                    const response = await fetch(fileUrl);
                    const blob = await response.blob();
                    const domUrl = window.URL.createObjectURL(blob);

                    const link = document.createElement('a');
                    link.href = domUrl;
                    link.download = file.filename || 'download';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(domUrl);
                } catch (error) {
                    console.error('Error downloading file:', error);
                    // Fallback to opening in new tab
                    window.open(fileUrl, '_blank');
                }
            } else {
                Linking.openURL(fileUrl).catch(err => console.error('Error opening file:', err));
            }
        }
    };

    return (
        <View style={[styles.container, isSender ? styles.sent : styles.received]}>
            {!isSender && (
                <TouchableOpacity onPress={() => onAvatarPress?.(file.senderId)}>
                    <Image
                        source={{ uri: resolveUrl(file.senderProfile) || `${SERVER_URL}/uploads/profiles/default-profile.jpg` }}
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
                    onLongPress={() => onLongPress?.(file)}
                    delayLongPress={300}
                    style={[styles.bubble, isSender ? styles.sentBubble : styles.receivedBubble]}
                >
                    {isHovered && file.status !== 'deleted' && Platform.OS === 'web' && (
                        <TouchableOpacity
                            style={styles.webMenuBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                onLongPress?.(file);
                            }}
                        >
                            <Text style={styles.webMenuIcon}>⌄</Text>
                        </TouchableOpacity>
                    )}
                    {!isSender && isGroup && (
                        <TouchableOpacity onPress={() => onAvatarPress?.(file.senderId)}>
                            <Text style={styles.senderName}>{file.senderName}</Text>
                        </TouchableOpacity>
                    )}

                    {file.replyToId && (
                        <View style={styles.replyContext}>
                            <Text style={styles.replyContextName}>{file.replyToSenderName}</Text>
                            <Text style={styles.replyContextText} numberOfLines={1}>
                                {file.replyToKind === 'file' ? '📄 File' : file.replyToText}
                            </Text>
                        </View>
                    )}

                    {isVoice ? (
                        <View style={styles.voiceContainer}>
                            <TouchableOpacity onPress={handlePlayVoice} style={styles.playBtn}>
                                <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
                            </TouchableOpacity>
                            <View style={styles.voiceInfo}>
                                <View style={styles.waveform}>
                                    {[...Array(20)].map((_, i) => (
                                        <View
                                            key={i}
                                            style={[
                                                styles.waveBar,
                                                {
                                                    height: 4 + Math.random() * 16,
                                                    backgroundColor: isPlaying
                                                        ? colors.primaryGreen
                                                        : colors.textMuted,
                                                },
                                            ]}
                                        />
                                    ))}
                                </View>
                                <Text style={styles.voiceDuration}>
                                    {playbackDuration > 0
                                        ? `${formatDuration(playbackPosition)} / ${formatDuration(playbackDuration)}`
                                        : '0:00'}
                                </Text>
                            </View>
                        </View>
                    ) : isImage ? (
                        <TouchableOpacity onPress={handleOpenFile}>
                            <Image source={{ uri: fileUrl }} style={styles.imagePreview} resizeMode="cover" />
                            <Text style={styles.fileName}>{file.filename}</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={handleOpenFile} style={styles.fileLink}>
                            <Text style={styles.fileIcon}>📄</Text>
                            <Text style={styles.fileName} numberOfLines={2}>{file.filename}</Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.timeContainer}>
                        <Text style={styles.messageTime}>{formatTime(file.timestamp)}</Text>
                        {isSender && (
                            <Text style={[
                                styles.statusTick,
                                file.status === 'read' ? styles.statusRead : null
                            ]}>
                                {file.status === 'read' || file.status === 'delivered' ? ' ✓✓' : ' ✓'}
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
        marginBottom: 4,
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
    voiceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minWidth: 200,
    },
    playBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.primaryGreen,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playIcon: {
        fontSize: 16,
        color: colors.white,
    },
    voiceInfo: {
        flex: 1,
    },
    waveform: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        height: 24,
    },
    waveBar: {
        width: 3,
        borderRadius: 1.5,
    },
    voiceDuration: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 2,
    },
    imagePreview: {
        width: 200,
        height: 200,
        borderRadius: 8,
        marginBottom: 4,
    },
    fileLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    fileIcon: {
        fontSize: 24,
    },
    fileName: {
        fontSize: 13,
        color: colors.primaryGreen,
        fontWeight: '500',
        flex: 1,
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

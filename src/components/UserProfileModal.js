import React, { useMemo, useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import {
    View,
    Text,
    Image,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { shadows } from '../theme';
import { getUser } from '../services/api';
import { SERVER_URL } from '../services/config';

function resolveUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${SERVER_URL}${path}`;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString([], {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function UserProfileModal({ visible, userId, onClose }) {
    const { colors } = useContext(ThemeContext);
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible && userId) {
            setLoading(true);
            getUser(userId)
                .then((data) => {
                    setUser(data);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error('Failed to load user profile:', err);
                    setLoading(false);
                });
        }
    }, [visible, userId]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
                    {/* Close button */}
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={colors.primaryGreen} />
                        </View>
                    ) : user ? (
                        <>
                            {/* Header */}
                            <View style={styles.header}>
                                <Image
                                    source={{
                                        uri: resolveUrl(user.profilePic) || `${SERVER_URL}/uploads/profiles/default-profile.jpg`,
                                    }}
                                    style={styles.profilePic}
                                />
                                <Text style={styles.username}>{user.username}</Text>
                                <Text style={styles.userId}>ID: {user.id}</Text>
                            </View>

                            {/* Body */}
                            <View style={styles.body}>
                                <View style={styles.infoSection}>
                                    <Text style={styles.infoLabel}>About</Text>
                                    <Text style={styles.infoValue}>{user.about || 'Hey there! I am using ClassChat'}</Text>
                                </View>

                                <View style={styles.infoSection}>
                                    <Text style={styles.infoLabel}>Status</Text>
                                    <View style={styles.statusRow}>
                                        <View style={styles.statusDot} />
                                        <Text style={styles.statusText}>Online</Text>
                                    </View>
                                </View>

                                <View style={styles.infoSection}>
                                    <Text style={styles.infoLabel}>Joined</Text>
                                    <Text style={styles.infoValue}>
                                        {user.joinedAt ? formatDate(user.joinedAt) : 'Unknown'}
                                    </Text>
                                </View>
                            </View>
                        </>
                    ) : (
                        <View style={styles.loadingContainer}>
                            <Text style={styles.errorText}>User not found</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const getStyles = (colors) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: 20,
        width: '85%',
        maxWidth: 400,
        overflow: 'hidden',
        ...shadows.large,
    },
    closeBtn: {
        position: 'absolute',
        top: 12,
        right: 16,
        zIndex: 10,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtnText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    loadingContainer: {
        padding: 60,
        alignItems: 'center',
    },
    header: {
        backgroundColor: colors.headerDark,
        alignItems: 'center',
        paddingVertical: 30,
        paddingHorizontal: 20,
    },
    profilePic: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.4)',
        marginBottom: 12,
    },
    username: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 4,
    },
    userId: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
    },
    body: {
        padding: 20,
    },
    infoSection: {
        marginBottom: 18,
    },
    infoLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.primaryGreen,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 15,
        color: colors.textPrimary,
        lineHeight: 22,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.online,
    },
    statusText: {
        fontSize: 15,
        color: colors.textPrimary,
    },
    errorText: {
        fontSize: 15,
        color: colors.textMuted,
    },
});

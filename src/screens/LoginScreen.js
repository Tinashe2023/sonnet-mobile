import React, { useMemo, useContext, useState } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Image,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { shadows } from '../theme';
import { uploadProfilePic, createRoom } from '../services/api';
import socket from '../services/socket';

export default function LoginScreen({ navigation }) {
    const { colors } = useContext(ThemeContext);
    const [username, setUsername] = useState('');
    const [about, setAbout] = useState('');
    const [profilePicAsset, setProfilePicAsset] = useState(null);
    const [roomId, setRoomId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expoPushToken, setExpoPushToken] = useState('');

    React.useEffect(() => {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });

        registerForPushNotificationsAsync().then(token => setExpoPushToken(token));
    }, []);

    async function registerForPushNotificationsAsync() {
        let token = null;
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') return null;

            try {
                token = (await Notifications.getExpoPushTokenAsync({ projectId: 'classchat' })).data;
            } catch (error) {
                console.log('Error getting push token', error);
            }
        }
        return token;
    }

    const pickProfilePic = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera roll access to pick a profile picture.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (!result.canceled && result.assets[0]) {
            setProfilePicAsset(result.assets[0]);
        }
    };

    const handleLogin = async () => {
        const trimmed = username.trim();
        if (!trimmed) {
            Alert.alert('Username required', 'Please enter a username');
            return;
        }

        setLoading(true);

        let profilePicPath = '/uploads/profiles/default-profile.jpg';

        if (profilePicAsset) {
            try {
                const fileName = profilePicAsset.uri.split('/').pop() || 'profile.jpg';
                const result = await uploadProfilePic(
                    profilePicAsset.uri,
                    fileName,
                    'image/jpeg',
                    profilePicAsset.file
                );
                if (result.profilePic) {
                    profilePicPath = result.profilePic.path;
                }
            } catch (error) {
                console.error('Error uploading profile pic:', error);
            }
        }

        socket.emit('user-register', {
            username: trimmed,
            profilePic: profilePicPath,
            about: about.trim() || 'Hey there! I am using ClassChat',
            roomId: roomId,
            pushToken: expoPushToken || null,
        });

        socket.once('user-registered', (user) => {
            setLoading(false);
            navigation.replace('Chat', { user, roomId: user.roomId });
        });

        setTimeout(() => {
            setLoading(false);
        }, 10000);
    };

    const handleCreateRoom = async () => {
        try {
            const data = await createRoom();
            setRoomId(data.roomId);
            Alert.alert(
                'Private Room Created!',
                `Room ID: ${data.roomId}\n\nShare this room ID with others so they can join.`,
                [{ text: 'OK' }]
            );
        } catch (error) {
            console.error('Error creating room:', error);
            Alert.alert('Error', 'Failed to create room');
        }
    };

    return (
        <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.container}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.card}>
                        <Text style={styles.title}>Welcome to ClassChat</Text>

                        {roomId && (
                            <View style={styles.roomIndicator}>
                                <Text style={styles.roomIndicatorText}>🔒 Private Room: {roomId}</Text>
                            </View>
                        )}

                        {/* Profile Picture */}
                        <TouchableOpacity onPress={pickProfilePic} style={styles.profilePicSection}>
                            <View style={styles.profilePicContainer}>
                                <Image
                                    source={
                                        profilePicAsset
                                            ? { uri: profilePicAsset.uri }
                                            : require('../../assets/default-profile.png')
                                    }
                                    style={styles.profilePicPreview}
                                />
                                <View style={styles.cameraIcon}>
                                    <Text style={styles.cameraIconText}>📷</Text>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* Username */}
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your username..."
                            placeholderTextColor="#aab4be"
                            value={username}
                            onChangeText={setUsername}
                            maxLength={20}
                            autoCapitalize="none"
                            cursorColor="#075e54"
                            selectionColor="#075e54"
                        />

                        {/* About */}
                        <TextInput
                            style={[styles.input, styles.aboutInput]}
                            placeholder="Enter your about/status (optional)..."
                            placeholderTextColor="#aab4be"
                            value={about}
                            onChangeText={setAbout}
                            maxLength={139}
                            multiline
                            numberOfLines={3}
                            cursorColor="#075e54"
                            selectionColor="#075e54"
                        />

                        {/* Room ID Input */}
                        <TextInput
                            style={styles.input}
                            placeholder="Room ID (leave empty for public)"
                            placeholderTextColor="#aab4be"
                            value={roomId || ''}
                            onChangeText={(text) => setRoomId(text || null)}
                            autoCapitalize="none"
                            cursorColor="#075e54"
                            selectionColor="#075e54"
                        />

                        {/* Login Button */}
                        <TouchableOpacity
                            style={styles.loginBtn}
                            onPress={handleLogin}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#25D366', '#1ea952']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.loginBtnGradient}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#ffffff" />
                                ) : (
                                    <Text style={styles.loginBtnText}>START CHATTING</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Create Room */}
                        <TouchableOpacity
                            style={styles.createRoomBtn}
                            onPress={handleCreateRoom}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={[colors.gradientStart, colors.gradientEnd]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.createRoomBtnGradient}
                            >
                                <Text style={styles.createRoomBtnText}>🔗 Create Private Room</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

// The login card is always white/light, so we use hardcoded
// dark values here — never theme colors — so it looks correct
// in both light and dark mode.
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 30,
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
        ...shadows.large,
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
        color: '#1a1a2e',        // Always dark — visible on white card
        marginBottom: 24,
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    roomIndicator: {
        backgroundColor: '#667eea',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 10,
        marginBottom: 16,
        width: '100%',
        alignItems: 'center',
    },
    roomIndicatorText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '500',
    },
    profilePicSection: {
        marginBottom: 20,
    },
    profilePicContainer: {
        width: 100,
        height: 100,
        position: 'relative',
    },
    profilePicPreview: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#e8edf2',
        ...shadows.medium,
    },
    cameraIcon: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#25D366',
        width: 35,
        height: 35,
        borderRadius: 17.5,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#ffffff',
    },
    cameraIconText: {
        fontSize: 16,
    },
    input: {
        width: '100%',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderWidth: 1.5,
        borderColor: '#d0d9e3',
        borderRadius: 25,
        fontSize: 15,
        backgroundColor: '#f9fafb',
        marginBottom: 14,
        color: '#1a1a2e',        // Always dark — typed text is always visible
    },
    aboutInput: {
        borderRadius: 15,
        minHeight: 70,
        textAlignVertical: 'top',
    },
    loginBtn: {
        width: '100%',
        marginTop: 6,
        marginBottom: 10,
        borderRadius: 25,
        overflow: 'hidden',
        ...shadows.small,
    },
    loginBtnGradient: {
        paddingVertical: 16,
        alignItems: 'center',
        borderRadius: 25,
    },
    loginBtnText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 1.5,
    },
    createRoomBtn: {
        width: '100%',
        borderRadius: 20,
        overflow: 'hidden',
    },
    createRoomBtnGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        borderRadius: 20,
    },
    createRoomBtnText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '500',
    },
});

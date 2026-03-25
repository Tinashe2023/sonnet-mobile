import React, { useMemo, useContext, useState, useRef, useEffect } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Audio } from 'expo-av';

import { uploadFile } from '../services/api';
import socket from '../services/socket';

export default function VoiceRecorder({ currentUser, activeChat, onClose }) {
    const { colors } = useContext(ThemeContext);
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingRef = useRef(null);
    const intervalRef = useRef(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        startRecording();
        return () => {
            stopRecording(false);
        };
    }, []);

    useEffect(() => {
        if (isRecording) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.15,
                        duration: 500,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isRecording]);

    const startRecording = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                console.error('Audio permission not granted');
                onClose();
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const recording = new Audio.Recording();
            await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            await recording.startAsync();

            recordingRef.current = recording;
            setIsRecording(true);
            setRecordingDuration(0);

            intervalRef.current = setInterval(() => {
                setRecordingDuration((prev) => prev + 1);
            }, 1000);
        } catch (error) {
            console.error('Error starting recording:', error);
            onClose();
        }
    };

    const stopRecording = async (shouldSend) => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (!recordingRef.current) {
            onClose();
            return;
        }

        try {
            await recordingRef.current.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

            if (shouldSend) {
                const uri = recordingRef.current.getURI();
                if (uri) {
                    const fileName = `voice-${Date.now()}.m4a`;
                    const timestamp = Date.now();
                    const recipientId = activeChat !== 'group' ? activeChat : null;

                    try {
                        let originalBlob = null;
                        if (Platform.OS === 'web') {
                            const response = await fetch(uri);
                            originalBlob = await response.blob();
                        }

                        const result = await uploadFile(
                            uri,
                            fileName,
                            'audio/m4a',
                            currentUser.username,
                            timestamp,
                            recipientId,
                            originalBlob
                        );

                        if (result.file) {
                            socket.emit('file-upload', {
                                ...result.file,
                                recipientId,
                                isVoiceMessage: true,
                            });
                        }
                    } catch (error) {
                        console.error('Error uploading voice message:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error stopping recording:', error);
        }

        recordingRef.current = null;
        setIsRecording(false);
        onClose();
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.duration}>{formatDuration(recordingDuration)}</Text>
            <Text style={styles.label}>Recording...</Text>

            <View style={styles.actions}>
                <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => stopRecording(false)}
                >
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={() => stopRecording(true)}
                >
                    <Text style={styles.sendText}>Send</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const getStyles = (colors) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 2,
        borderTopColor: colors.primaryGreen,
        gap: 12,
    },
    recordingDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: colors.recording,
    },
    duration: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.recording,
        minWidth: 40,
    },
    label: {
        flex: 1,
        fontSize: 14,
        color: colors.textMuted,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    cancelBtn: {
        backgroundColor: colors.error,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    cancelText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '500',
    },
    sendBtn: {
        backgroundColor: colors.primaryGreen,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    sendText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '500',
    },
});

import { io } from 'socket.io-client';
import { SERVER_URL } from './config';
import { Platform } from 'react-native';

const socket = io(SERVER_URL, {
    transports: Platform.OS === 'web' ? ['polling', 'websocket'] : ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
});

socket.on('connect_error', (error) => {
    console.log('Socket connection error:', error.message);
});

export default socket;

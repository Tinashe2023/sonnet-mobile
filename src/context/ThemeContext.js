import React, { createContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors } from '../theme';

export const ThemeContext = createContext({
    isDark: false,
    colors: lightColors,
    setScheme: () => { },
});

export const ThemeProvider = ({ children }) => {
    // get system color scheme
    const colorScheme = useColorScheme();
    const [isDark, setIsDark] = useState(colorScheme === 'dark');

    // On system scheme change, update it if no manual override (for now just syncing it)
    useEffect(() => {
        setIsDark(colorScheme === 'dark');
    }, [colorScheme]);

    const defaultTheme = {
        isDark,
        colors: isDark ? darkColors : lightColors,
        setScheme: (scheme) => setIsDark(scheme === 'dark'),
    };

    return (
        <ThemeContext.Provider value={defaultTheme}>
            {children}
        </ThemeContext.Provider>
    );
};

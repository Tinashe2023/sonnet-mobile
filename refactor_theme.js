const fs = require('fs');
const path = require('path');

const files = [
    'src/screens/LoginScreen.js',
    'src/screens/ChatScreen.js',
    'src/components/VoiceRecorder.js',
    'src/components/UserProfileModal.js',
    'src/components/MessageBubble.js',
    'src/components/FileBubble.js'
];

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Remove `colors` from import `../theme`
    content = content.replace(/import\s*\{\s*([^}]*colors[^}]*)\s*\}\s*from\s*['"]\.\.?\/theme['"];?/, (match, group1) => {
        let newImport = group1.replace(/\bcolors\b,?/, '').trim();
        if (newImport.endsWith(',')) newImport = newImport.slice(0, -1);
        newImport = newImport.replace(/,\s*,/g, ',');
        return newImport ? `import { ${newImport} } from '${match.split('from')[1].trim().replace(/['";]/g, '')}';` : '';
    });

    // 2. Add ThemeContext import
    if (!content.includes('ThemeContext')) {
        let relativePath = file.includes('components') ? '../context/ThemeContext' : '../context/ThemeContext';
        if (file.includes('ChatScreen') || file.includes('LoginScreen')) {
            relativePath = '../context/ThemeContext';
        }
        content = content.replace(/(import React[^;]*;)/, `$1\nimport { ThemeContext } from '${relativePath}';`);
    }

    // 3. Ensure useContext and useMemo are available from React
    content = content.replace(/import React\b([^;]*);/, (match, group1) => {
        let extra = group1 || '';
        if (!extra.includes('{')) {
            extra = ', { useContext, useMemo }';
        } else {
            if (!extra.includes('useContext')) extra = extra.replace('{', '{ useContext, ');
            if (!extra.includes('useMemo')) extra = extra.replace('{', '{ useMemo, ');
        }
        return `import React${extra};`;
    });

    // 4. Transform `const styles = StyleSheet.create({` to `const getStyles = (colors) => StyleSheet.create({`
    content = content.replace(/const styles = StyleSheet\.create\(\{/, 'const getStyles = (colors) => StyleSheet.create({');

    // 5. Inject `const { colors } = useContext(ThemeContext); const styles = useMemo(() => getStyles(colors), [colors]);` inside the main component
    const componentRegex = /export (default )?(function \w+\(|const \w+ = \()/;
    const match = content.match(componentRegex);

    if (match) {
        // Find the block opening `{` after the component parameters
        const idx = content.indexOf('{', match.index);
        if (idx !== -1) {
            const before = content.slice(0, idx + 1);
            const after = content.slice(idx + 1);
            if (!after.includes('const { colors } = useContext')) {
                content = before + `\n    const { colors } = useContext(ThemeContext);\n    const styles = useMemo(() => getStyles(colors), [colors]);\n` + after;
            }
        }
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Refactored ${file}`);
});

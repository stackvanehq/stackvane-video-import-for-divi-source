/*
 * Builds dist/builder.min.css, the one stylesheet this plugin ships.
 *
 * Run by `npm run build` after webpack, so a watch rebuild of the JavaScript never races it.
 */
const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');

const root = path.resolve(__dirname, '..');
const SOURCE = 'client/builder/builder.css';
const TARGET = 'dist/builder.min.css';

/*
 * Level 1, not 2: level 2 restructures and reorders rules across the whole file, and builder.css
 * wins its fights with Divi's own stylesheet on source order, so reordering it is a real risk.
 */
const minifier = new CleanCSS({ level: 1, returnPromise: false });

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

const build = () => {
    const sourcePath = path.join(root, SOURCE);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing stylesheet: ${SOURCE}`);
    }

    const source = fs.readFileSync(sourcePath, 'utf8');
    const result = minifier.minify(source);

    if (result.errors.length) {
        throw new Error(`${TARGET}: ${result.errors.join(', ')}`);
    }

    result.warnings.forEach((warning) => console.warn(`  ! ${TARGET}: ${warning}`));

    const absolute = path.join(root, TARGET);

    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, result.styles);

    console.log(`  ${TARGET}  ${kb(Buffer.byteLength(source))} -> ${kb(Buffer.byteLength(result.styles))}`);
};

try {
    build();
} catch (error) {
    console.error(`\n  CSS build failed: ${error.message}\n`);
    process.exit(1);
}

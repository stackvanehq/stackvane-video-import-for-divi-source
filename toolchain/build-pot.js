/*
 * Builds languages/stackvane-video-import-for-divi.pot.
 *
 * `wp i18n make-pot` is the usual tool for this and is what a machine with WP-CLI should use. It is
 * not installed here, and a POT file is a text format with a small grammar, so this extracts the
 * same calls directly. It is wired into `npm run build`, so the catalogue cannot silently drift
 * from the source again.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const slug = 'stackvane-video-import-for-divi';
const target = path.join(root, 'languages', `${slug}.pot`);

const SCAN = [
    { dir: 'src', ext: /\.php$/ },
    { dir: 'client', ext: /\.jsx?$/ },
];

const ROOT_FILES = [`${slug}.php`, 'uninstall.php'];

/*
 * Which argument of each call is which. `text` is the singular, `plural` the plural form, `context`
 * the disambiguating context, all 1-indexed over the call's arguments.
 */
const FUNCTIONS = {
    __: { text: 1 },
    _e: { text: 1 },
    esc_html__: { text: 1 },
    esc_html_e: { text: 1 },
    esc_attr__: { text: 1 },
    esc_attr_e: { text: 1 },
    _x: { text: 1, context: 2 },
    esc_html_x: { text: 1, context: 2 },
    esc_attr_x: { text: 1, context: 2 },
    _n: { text: 1, plural: 2 },
    _nx: { text: 1, plural: 2, context: 4 },
};

const NAMES = Object.keys(FUNCTIONS).sort((a, b) => b.length - a.length);

const walk = (dir, ext, into) => {
    const absolute = path.join(root, dir);

    if (!fs.existsSync(absolute)) {
        return;
    }

    for (const item of fs.readdirSync(absolute, { withFileTypes: true })) {
        const next = path.posix.join(dir, item.name);

        if (item.isDirectory()) {
            walk(next, ext, into);
        } else if (ext.test(item.name)) {
            into.push(next);
        }
    }
};

const readString = (source, from) => {
    const quote = source[from];

    if (quote !== '"' && quote !== "'") {
        return null;
    }

    let value = '';
    let i = from + 1;

    while (i < source.length) {
        const char = source[i];

        if (char === '\\') {
            const escaped = source[i + 1];

            if (escaped === 'n') {
                value += '\n';
            } else if (escaped === 't') {
                value += '\t';
            } else {
                value += escaped;
            }

            i += 2;
            continue;
        }

        if (char === quote) {
            return { value, end: i + 1 };
        }

        value += char;
        i += 1;
    }

    return null;
};

const readArgs = (source, open) => {
    const args = [];
    let depth = 0;
    let start = open + 1;
    let i = open + 1;

    while (i < source.length) {
        const char = source[i];

        if (char === '"' || char === "'") {
            const literal = readString(source, i);

            if (!literal) {
                return null;
            }

            i = literal.end;
            continue;
        }

        if (char === '(' || char === '[') {
            depth += 1;
        } else if (char === ']') {
            depth -= 1;
        } else if (char === ')') {
            if (depth === 0) {
                args.push({ raw: source.slice(start, i), at: start });

                return args;
            }

            depth -= 1;
        } else if (char === ',' && depth === 0) {
            args.push({ raw: source.slice(start, i), at: start });
            start = i + 1;
        }

        i += 1;
    }

    return null;
};

const literalOf = (source, arg) => {
    const offset = arg.raw.search(/\S/);

    if (offset < 0) {
        return null;
    }

    const literal = readString(source, arg.at + offset);

    if (!literal) {
        return null;
    }

    return arg.raw.slice(offset + (literal.end - (arg.at + offset))).trim() === ''
        ? literal.value
        : null;
};

const lineAt = (source, index) => source.slice(0, index).split('\n').length;

const commentAbove = (source, index) => {
    const before = source.lastIndexOf('/* translators:', index);

    if (before < 0) {
        return '';
    }

    const close = source.indexOf('*/', before);

    if (close < 0 || close > index) {
        return '';
    }

    if (source.slice(close + 2, index).trim() !== '') {
        return '';
    }

    return source
        .slice(before + 2, close)
        .replace(/\s+/g, ' ')
        .trim();
};

const escapePo = (value) => value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');

const extract = (file, entries) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');

    for (const name of NAMES) {
        const spec = FUNCTIONS[name];
        const pattern = new RegExp(`(^|[^\\w$])${name}\\s*\\(`, 'g');
        let match = pattern.exec(source);

        while (match !== null) {
            const open = match.index + match[0].length - 1;
            const args = readArgs(source, open);
            const text = args && args.length >= spec.text ? literalOf(source, args[spec.text - 1]) : null;

            if (text !== null && text !== '') {
                const context = spec.context && args.length >= spec.context
                    ? literalOf(source, args[spec.context - 1])
                    : null;
                const plural = spec.plural && args.length >= spec.plural
                    ? literalOf(source, args[spec.plural - 1])
                    : null;
                const key = `${context || ''}${text}${plural || ''}`;
                const line = lineAt(source, match.index);

                if (!entries.has(key)) {
                    entries.set(key, {
                        text,
                        plural,
                        context,
                        comment: commentAbove(source, match.index),
                        references: [],
                    });
                }

                const entry = entries.get(key);

                entry.references.push(`${file}:${line}`);

                if (entry.comment === '') {
                    entry.comment = commentAbove(source, match.index);
                }
            }

            match = pattern.exec(source);
        }
    }
};

const header = (version) => `# Copyright (C) ${new Date().getFullYear()} StackVaneHQ
# This file is distributed under the GPL-2.0-or-later license.
msgid ""
msgstr ""
"Project-Id-Version: StackVane Video Import for Divi ${version}\\n"
"Report-Msgid-Bugs-To: https://www.stackvanehq.com/\\n"
"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"
"Language-Team: LANGUAGE <LL@li.org>\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"
"X-Generator: toolchain/build-pot.js\\n"
"X-Domain: ${slug}\\n"
`;

const build = () => {
    const entry = path.join(root, `${slug}.php`);
    const declared = fs.readFileSync(entry, 'utf8').match(/^\s*\*\s*Version:\s*(.+)$/m);
    const version = declared ? declared[1].trim() : '0.0.0';

    const files = [...ROOT_FILES];

    SCAN.forEach(({ dir, ext }) => walk(dir, ext, files));
    files.sort();

    const entries = new Map();

    files.forEach((file) => extract(file, entries));

    const blocks = [...entries.values()]
        .sort((a, b) => (a.references[0] || '').localeCompare(b.references[0] || ''))
        .map((item) => {
            const lines = [];

            if (item.comment) {
                lines.push(`#. ${item.comment}`);
            }

            lines.push(`#: ${item.references.join(' ')}`);

            if (item.context) {
                lines.push(`msgctxt "${escapePo(item.context)}"`);
            }

            lines.push(`msgid "${escapePo(item.text)}"`);

            if (item.plural) {
                lines.push(`msgid_plural "${escapePo(item.plural)}"`);
                lines.push('msgstr[0] ""');
                lines.push('msgstr[1] ""');
            } else {
                lines.push('msgstr ""');
            }

            return lines.join('\n');
        });

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${header(version)}\n${blocks.join('\n\n')}\n`);

    console.log(`  languages/${slug}.pot  ${entries.size} strings from ${files.length} files`);
};

try {
    build();
} catch (error) {
    console.error(`\n  POT build failed: ${error.message}\n`);
    process.exit(1);
}
